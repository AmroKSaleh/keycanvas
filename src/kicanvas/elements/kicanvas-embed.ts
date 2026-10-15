/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { DeferredPromise, later } from "../../base/async";
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
    KiCanvasLoadEvent,
    KiCanvasSelectEvent,
} from "../../viewers/base/events";
import type { Viewer } from "../../viewers/base/viewer";
import type { SchematicViewer } from "../../viewers/schematic/viewer";
import { Project } from "../project";
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
import { find_reference } from "./select-reference";

const log = new Logger("kicanvas:embedtag");

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
                font-family:
                    "Nunito", ui-rounded, "Hiragino Maru Gothic ProN",
                    Quicksand, Comfortaa, Manjari, "Arial Rounded MT Bold",
                    Calibri, source-sans-pro, sans-serif;
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

    custom_resolver: ((name: string) => URL) | null = null;

    #schematic_app: KCSchematicAppElement;
    #board_app: KCBoardAppElement;

    /** Resolves once the project is loaded and its first page is active. */
    #ready = new DeferredPromise<boolean>();

    /** Serializes selectReference() calls so page switches don't interleave. */
    #selecting: Promise<unknown> = Promise.resolve();

    override initialContentCallback() {
        this.#setup_events();
        later(() => {
            this.#load_src();
        });
    }

    async #setup_events() {}

    async #load_src() {
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
            return;
        }

        const vfs = new MergedFileSystem([url_vfs, inline_vfs]);
        await this.#setup_project(vfs);
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
            this.#ready.resolve(true);
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
            if (app) {
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
    }

    /**
     * Selects the schematic symbol with this reference designator (e.g.
     * "R12") and zooms to it, switching to the sheet that shows it first.
     * A sheet placed more than once is matched per placement. Resolves
     * false when no schematic page shows the reference. A successful
     * selection emits `kicanvas:select`, as a click would.
     */
    public selectReference(
        reference: string,
        opts: { zoom?: boolean } = {},
    ): Promise<boolean> {
        const run = this.#selecting.then(() =>
            this.#select_reference(reference, opts.zoom ?? true),
        );
        this.#selecting = run.catch(() => undefined);
        return run;
    }

    async #select_reference(reference: string, zoom: boolean) {
        await this.#ready;

        const app = this.#schematic_app;
        const found = app ? find_reference(this.#project, reference) : null;
        if (!app || !found) {
            return false;
        }

        await app.viewerReady;
        const viewer = app.viewer as SchematicViewer;

        if (this.#project.active_page !== found.page) {
            // The viewer clears its selection when a page finishes loading,
            // so wait for that before selecting.
            const loaded = new Promise<void>((resolve) => {
                const listener = viewer.addEventListener(
                    KiCanvasLoadEvent.type,
                    () => {
                        listener.dispose();
                        resolve();
                    },
                );
            });
            this.#project.set_active_page(found.page);
            await loaded;
        } else {
            await viewer.loaded;
        }

        viewer.select(found.uuid);
        if (!viewer.selected) {
            return false;
        }
        if (zoom) {
            viewer.zoom_to_selection();
        }
        return true;
    }

    #on_viewer_select(item: unknown) {
        // Selection was cleared.
        if (item === null || item === undefined) {
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
                controlslist="${this.controlslist}">
            </kc-schematic-app>` as KCSchematicAppElement;
        }

        if (this.#project.has_boards && !this.#board_app) {
            this.#board_app = html`<kc-board-app
                sidebarcollapsed
                controls="${this.controls}"
                controlslist="${this.controlslist}">
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
