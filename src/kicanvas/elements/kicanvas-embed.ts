/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { later } from "../../base/async";
import { Logger } from "../../base/log";
import {
    CSS,
    CustomElement,
    attribute,
    css,
    html,
} from "../../base/web-components";
import { KCUIElement } from "../../kc-ui";
import kc_ui_styles from "../../kc-ui/kc-ui.css";
import {
    KiCanvasBoxSelectEvent,
    KiCanvasLoadEvent,
    KiCanvasSelectEvent,
} from "../../viewers/base/events";
import type { PendingMark, Viewer } from "../../viewers/base/viewer";
import { BoardViewer } from "../../viewers/board/viewer";
import { SchematicViewer } from "../../viewers/schematic/viewer";
import { Project, type ProjectPage } from "../project";
import {
    FetchFileSystem,
    LocalFileSystem,
    MergedFileSystem,
    type IFileSystem,
} from "../services/vfs";
import type { KCBoardAppElement } from "./kc-board/app";
import type { KCSchematicAppElement } from "./kc-schematic/app";
import {
    build_select_detail,
    KICANVAS_DESELECT_EVENT,
    KICANVAS_SELECT_EVENT,
} from "./select-event";

const log = new Logger("kicanvas:embedtag");

/** Dispatched when the user draws a box with shift+drag, see boxselect. */
const KICANVAS_BOXSELECT_EVENT = "kicanvas:boxselect";

/**
 * kicanvas-embed tag
 */
class KiCanvasEmbedElement extends KCUIElement {
    static override styles = [
        ...KCUIElement.styles,
        new CSS(kc_ui_styles),
        css`
            :host {
                margin: 0;
                display: flex;
                position: relative;
                width: 100%;
                max-height: 100%;
                aspect-ratio: 1.414;
                background-color: aqua;
                color: var(--fg);
                font-family: var(
                    --font-text,
                    "Nunito", ui-rounded, "Hiragino Maru Gothic ProN",
                    Quicksand, Comfortaa, Manjari, "Arial Rounded MT Bold",
                    Calibri, source-sans-pro, sans-serif
                );
                contain: layout paint;
            }

            main {
                display: contents;
            }

            kc-board-app,
            kc-schematic-app {
                width: 100%;
                height: 100%;
                flex: 1;
            }
        `,
    ];

    constructor() {
        super();
        this.provideContext("project", this.#project);
    }

    #project: Project = new Project();

    @attribute({ type: String })
    src: string | null;

    @attribute({ type: Boolean })
    public loading: boolean;

    @attribute({ type: Boolean })
    public loaded: boolean;

    @attribute({ type: String })
    controls: "none" | "basic" | "full" | null;

    @attribute({ type: String })
    controlslist: string | null;

    @attribute({ type: String })
    theme: string | null;

    @attribute({ type: String })
    zoom: "objects" | "page" | string | null;

    /** When set, shift+drag draws a box and dispatches kicanvas:boxselect. */
    @attribute({ type: Boolean })
    boxselect: boolean;

    custom_resolver: ((name: string) => URL) | null = null;

    #schematic_app: KCSchematicAppElement;
    #board_app: KCBoardAppElement;

    /** Apps whose viewer events are already re-dispatched publicly. */
    #watched_apps = new WeakSet<object>();

    /** Settles when the first load from the element's sources has run. */
    #first_load_done: () => void = () => undefined;
    #first_load: Promise<void> = new Promise((resolve) => {
        this.#first_load_done = resolve;
    });

    /** Reloads run one after another, never overlapping. */
    #reload_queue: Promise<void> = Promise.resolve();

    /** While true, the viewer's own select/deselect is not re-dispatched. */
    #reloading = false;

    /** The reference of the selected footprint or symbol, if any. */
    #selected_reference: string | null = null;

    /** The parts the host marked as pending, see setPending(). */
    #pending: PendingMark[] = [];

    override initialContentCallback() {
        this.#setup_events();
        later(async () => {
            try {
                await this.#load_src();
            } finally {
                this.#first_load_done();
            }
        });
    }

    async #setup_events() {}

    /**
     * Re-read every source (the `src` attribute as it is now, and each
     * `<kicanvas-source>`) and show the new content, keeping the camera and,
     * when the part still exists, the selection.
     *
     * Public host API, see docs/embedding.md.
     */
    public reload(): Promise<void> {
        const run = this.#reload_queue.then(() => this.#reload());
        // A failed reload must not wedge the ones queued after it.
        this.#reload_queue = run.catch(() => undefined);
        return run;
    }

    /**
     * Select the board footprint or schematic symbol with this reference in
     * the shown document and zoom to it. Returns false, changing nothing,
     * when nothing is loaded or no such part is shown.
     *
     * Public host API, see docs/embedding.md.
     */
    public select(reference: string): boolean {
        return this.#select(reference, true);
    }

    /**
     * Highlight the board net with this name and frame it. Returns false when
     * no board is shown or the board has no such net.
     *
     * Public host API, see docs/embedding.md.
     */
    public focusNet(name: string): boolean {
        const viewer = this.#active_viewer();
        if (!(viewer instanceof BoardViewer)) {
            return false;
        }
        return viewer.focus_net(name);
    }

    /**
     * Outline these parts with a dashed teal line, each with its label when
     * it has one, replacing the previous set; `[]` clears it. The set is
     * kept: every document shown afterwards (a reload, another sheet) is
     * marked again from it. Leaves the selection and the camera alone.
     * Returns how many of the distinct references are on the shown document.
     *
     * Public host API, see docs/embedding.md.
     */
    public setPending(items: { reference: string; label?: string }[]): number {
        this.#pending = (items ?? [])
            .filter((i) => typeof i?.reference === "string" && i.reference)
            .map((i) => ({
                reference: i.reference,
                label: typeof i.label === "string" ? i.label : undefined,
            }));

        const active = this.#active_viewer();
        let found = 0;
        for (const viewer of this.#ready_viewers()) {
            const n = viewer.set_pending(this.#pending);
            if (viewer === active) {
                found = n;
            }
        }
        return found;
    }

    /**
     * Highlight these parts once, with a teal outline that fades out over
     * about a second. Returns how many of the distinct references are on the
     * shown document.
     *
     * Public host API, see docs/embedding.md.
     */
    public flash(references: string[]): number {
        return this.#active_viewer()?.flash(references ?? []) ?? 0;
    }

    /**
     * Frame these parts together, without selecting them. Returns false,
     * leaving the camera alone, when none of them is on the shown document.
     *
     * Public host API, see docs/embedding.md.
     */
    public zoomTo(references: string[]): boolean {
        return this.#active_viewer()?.zoom_to_parts(references ?? []) ?? false;
    }

    *#ready_viewers() {
        for (const app of [this.#schematic_app, this.#board_app]) {
            if (app && app.viewerReady.resolved && app.viewer) {
                yield app.viewer as Viewer;
            }
        }
    }

    async #reload() {
        await this.#first_load;

        if (!this.loaded) {
            // The first load never produced anything; start from scratch.
            await this.#load_src();
            return;
        }

        const vfs = this.#make_vfs();
        if (!vfs) {
            return;
        }

        const active_path = this.#project.active_page?.project_path;
        const reference = this.#selected_reference;

        this.#reloading = true;
        this.loading = true;
        try {
            await vfs.setup();
            await this.#project.load(vfs);

            // A document type the first load did not have needs its app.
            if (
                (this.#project.has_boards && !this.#board_app) ||
                (this.#project.has_schematics && !this.#schematic_app)
            ) {
                await this.update();
                this.#setup_selection_events();
            }

            const page =
                (active_path && this.#project.page_by_path(active_path)) ||
                this.#project.root_schematic_page ||
                this.#project.first_page;

            if (!page) {
                return;
            }

            const app = this.#app_for(page);
            let shown: Promise<void> = Promise.resolve();
            if (app && app.viewerReady.resolved) {
                const viewer = app.viewer;
                if (
                    viewer instanceof BoardViewer ||
                    viewer instanceof SchematicViewer
                ) {
                    viewer.keep_view_on_next_load();
                }
                shown = this.#next_load(viewer);
            }

            this.#project.set_active_page(page);
            await shown;
        } finally {
            this.#reloading = false;
            this.loading = false;
        }

        if (reference && !this.#select(reference, false)) {
            this.#on_viewer_select(null);
        }
    }

    #next_load(viewer: Viewer): Promise<void> {
        return new Promise((resolve) => {
            const listener = viewer.addEventListener(
                KiCanvasLoadEvent.type,
                () => {
                    listener.dispose();
                    // The viewer finishes positioning in the same task that
                    // fires load; let that task complete first.
                    later(resolve);
                },
            );
        });
    }

    #app_for(page: ProjectPage) {
        return page.type == "pcb" ? this.#board_app : this.#schematic_app;
    }

    #active_viewer(): Viewer | null {
        const page = this.#project.active_page;
        if (!page || !this.loaded) {
            return null;
        }
        const app = this.#app_for(page);
        if (!app || !app.viewerReady.resolved) {
            return null;
        }
        const viewer = app.viewer;
        return viewer?.loaded.isOpen ? viewer : null;
    }

    #select(reference: string, zoom: boolean): boolean {
        const viewer = this.#active_viewer();

        if (viewer instanceof BoardViewer) {
            const footprint = viewer.board?.find_footprint(reference);
            if (!footprint) {
                return false;
            }
            viewer.select(footprint);
        } else if (viewer instanceof SchematicViewer) {
            const symbol = viewer.schematic?.find_symbol(reference);
            if (!symbol) {
                return false;
            }
            viewer.select(symbol);
            if (!viewer.selected) {
                return false;
            }
        } else {
            return false;
        }

        if (zoom) {
            viewer.zoom_to_selection();
        }
        return true;
    }

    #make_vfs(): IFileSystem | null {
        const url_src = [];
        const inline_file = [];

        if (this.src) {
            url_src.push(this.src);
        }

        let inline_count = 0;

        for (const src_elm of this.querySelectorAll<KiCanvasSourceElement>(
            "kicanvas-source",
        )) {
            if (src_elm.src) {
                // URL
                url_src.push(src_elm.src);
            } else if (src_elm.is_inline_source()) {
                // inline source
                const default_name = `inline_${inline_count}`;
                inline_count += 1;

                const file = src_elm.load_inline_source(default_name);

                if (file) {
                    log.info(
                        `Determined inline source ${file.name}, ${file.size} bytes`,
                    );

                    inline_file.push(file);
                }
            }
        }

        // maybe we have a better way to merge two VFS
        // we need load file from File blobs and URLs

        const url_vfs =
            url_src.length === 0
                ? null
                : new FetchFileSystem(url_src, this.custom_resolver);

        const inline_vfs =
            inline_file.length === 0 ? null : new LocalFileSystem(inline_file);

        if (url_vfs === null && inline_vfs === null) {
            log.warn("No valid sources specified");
            return null;
        }

        return new MergedFileSystem([url_vfs, inline_vfs]);
    }

    async #load_src() {
        const vfs = this.#make_vfs();
        if (vfs) {
            await this.#setup_project(vfs);
        }
    }

    async #setup_project(vfs: IFileSystem) {
        this.loaded = false;
        this.loading = true;

        try {
            await vfs.setup();
            await this.#project.load(vfs);

            this.loaded = true;
            await this.update();

            this.#setup_selection_events();

            this.#project.set_active_page(this.#project.root_schematic_page!);
        } finally {
            this.loading = false;
        }
    }

    /**
     * Subscribe to each viewer's internal selection and re-dispatch the
     * public `kicanvas:select` / `kicanvas:deselect` events on this element.
     */
    #setup_selection_events() {
        for (const app of [this.#schematic_app, this.#board_app]) {
            if (app && !this.#watched_apps.has(app)) {
                this.#watched_apps.add(app);
                this.#watch_app_selection(app);
            }
        }
    }

    async #watch_app_selection(app: {
        viewerReady: PromiseLike<boolean>;
        readonly viewer: Viewer;
    }) {
        // The viewer is created asynchronously; wait until it's ready.
        await app.viewerReady;

        const viewer: Viewer = app.viewer;

        this.addDisposable(
            viewer.addEventListener(KiCanvasSelectEvent.type, (e) => {
                this.#on_viewer_select(e.detail.item);
            }),
        );

        // Host marks: the pending set made before this viewer existed, the
        // boxselect attribute as it is at each drag, and the box's contents.
        viewer.set_pending(this.#pending);
        viewer.box_select_enabled = () => this.boxselect;
        this.addDisposable(
            viewer.addEventListener(KiCanvasBoxSelectEvent.type, (e) => {
                this.dispatchEvent(
                    new CustomEvent(KICANVAS_BOXSELECT_EVENT, {
                        detail: {
                            references: [...e.detail.references],
                            nets: [...e.detail.nets],
                        },
                        bubbles: true,
                        composed: true,
                    }),
                );
            }),
        );
    }

    #on_viewer_select(item: unknown) {
        // A reload swaps documents under the viewer, which clears and then
        // restores the selection; the host hears only the outcome.
        if (this.#reloading) {
            return;
        }

        // Selection was cleared.
        if (item === null || item === undefined) {
            this.#selected_reference = null;
            this.dispatchEvent(
                new CustomEvent(KICANVAS_DESELECT_EVENT, {
                    bubbles: true,
                    composed: true,
                }),
            );
            return;
        }

        const detail = build_select_detail(item, {
            sheet: this.#project.active_page?.name,
        });

        // Only footprints and symbols map to a public selection payload;
        // ignore other selectable items (e.g. sheets, nets).
        if (detail) {
            this.#selected_reference = detail.reference;
            this.dispatchEvent(
                new CustomEvent(KICANVAS_SELECT_EVENT, {
                    detail,
                    bubbles: true,
                    composed: true,
                }),
            );
        }
    }

    override render() {
        if (!this.loaded) {
            return html``;
        }

        if (this.#project.has_schematics && !this.#schematic_app) {
            this.#schematic_app = html`<kc-schematic-app
                sidebarcollapsed
                controls="${this.controls}"
                controlslist="${this.controlslist}"
                theme="${this.theme ?? ""}">
            </kc-schematic-app>` as KCSchematicAppElement;
        }

        if (this.#project.has_boards && !this.#board_app) {
            this.#board_app = html`<kc-board-app
                sidebarcollapsed
                controls="${this.controls}"
                controlslist="${this.controlslist}"
                theme="${this.theme ?? ""}">
            </kc-board-app>` as KCBoardAppElement;
        }

        const focus_overlay =
            (this.controls ?? "none") == "none" ||
            this.controlslist?.includes("nooverlay")
                ? null
                : html`<kc-ui-focus-overlay></kc-ui-focus-overlay>`;

        return html`<main>
            ${this.#schematic_app} ${this.#board_app} ${focus_overlay}
        </main>`;
    }
}

window.customElements.define("kicanvas-embed", KiCanvasEmbedElement);

enum KiCanvasSourceType {
    Schematic = "schematic",
    Board = "board",
    Project = "project",
    Worksheet = "worksheet",
}

class KiCanvasSourceElement extends CustomElement {
    constructor() {
        super();
    }

    override connectedCallback() {
        this.ariaHidden = "true";
        this.hidden = true;
        this.style.display = "none";
        super.connectedCallback();
    }

    is_inline_source(): boolean {
        return this.src === null && this.childNodes.length > 0;
    }

    load_inline_source(default_name: string | null = null): File | undefined {
        let content = "";

        for (const child of this.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) {
                // Get the content and triming the CR,LF,space.
                content += child.nodeValue ?? "";
            } else {
                log.warn(
                    `kicanvas-source children ${child.nodeType} are invaild.`,
                );
            }
        }

        content = content.trimStart();

        // determine the file name
        let file_name;
        if (this.name) {
            file_name = this.name;
        } else {
            const typ =
                this.type ?? KiCanvasSourceElement.determine_file_type(content);

            if (typ === undefined) {
                log.warn(
                    `Unknown file type, content: ${content.slice(0, 64)}...`,
                );
                return undefined;
            }

            const ext = KiCanvasSourceElement.get_file_ext(typ);

            file_name = (default_name ?? "noname") + ext;
        }

        if (content.length === 0) {
            log.warn(`kicanvas-source content ${file_name} is empty.`);
            return undefined;
        }

        const file_blob = new Blob([content], { type: "text/plain" });
        const file = new File([file_blob], file_name);

        return file;
    }

    private static determine_file_type(
        content: string,
    ): KiCanvasSourceType | undefined {
        if (content.startsWith("(kicad_sch")) {
            return KiCanvasSourceType.Schematic;
        } else if (content.startsWith("(kicad_pcb")) {
            return KiCanvasSourceType.Board;
        } else if (content.startsWith("(kicad_wks")) {
            return KiCanvasSourceType.Worksheet;
        } else if (content.startsWith("{")) {
            // project? maybe we need try parsing the json
            return KiCanvasSourceType.Project;
        }

        return undefined;
    }

    private static get_file_ext(typ: KiCanvasSourceType): string {
        switch (typ) {
            case KiCanvasSourceType.Schematic:
                return ".kicad_sch";
            case KiCanvasSourceType.Board:
                return ".kicad_pcb";
            case KiCanvasSourceType.Worksheet:
                return ".kicad_wks";
            case KiCanvasSourceType.Project:
                return ".kicad_prj";
        }
    }

    @attribute({ type: String })
    src: string | null;

    @attribute({ type: String })
    type: KiCanvasSourceType | null;

    @attribute({ type: String })
    name: string | null;
}

window.customElements.define("kicanvas-source", KiCanvasSourceElement);

/* Import required fonts.
 * TODO: Package these up as part of KiCanvas
 */
document.body.appendChild(
    html`<link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@48,400,0,0&family=Nunito:wght@300;400;500;600;700&display=swap"
        crossorigin="anonymous" />`,
);
