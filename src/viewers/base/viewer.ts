/*
    Copyright (c) 2022 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { Barrier, later } from "../../base/async";
import { Disposables, type IDisposable } from "../../base/disposable";
import { listen } from "../../base/events";
import { no_self_recursion } from "../../base/functions";
import { BBox, Vec2 } from "../../base/math";
import { Color, Polygon, Polyline, Renderer } from "../../graphics";
import {
    KiCanvasBoxSelectEvent,
    KiCanvasLoadEvent,
    KiCanvasMouseMoveEvent,
    KiCanvasSelectEvent,
    type BoxSelectDetails,
    type KiCanvasEventMap,
} from "./events";
import {
    flash_duration,
    mark_color,
    paint_dashed_box,
    paint_label,
    paint_solid_box,
} from "./marks";
import { ViewLayerSet } from "./view-layers";
import { Viewport } from "./viewport";

/** A part a host application marked as pending, see Viewer.set_pending. */
export interface PendingMark {
    reference: string;
    label?: string;
}

/** Below this many pixels, a shift+drag is a shift+click. */
const box_select_min_drag = 4;

export abstract class Viewer extends EventTarget {
    public renderer: Renderer;
    public viewport: Viewport;
    public layers: ViewLayerSet;
    public mouse_position: Vec2 = new Vec2(0, 0);
    public loaded = new Barrier();

    protected disposables = new Disposables();
    protected setup_finished = new Barrier();

    #selected: BBox | null;

    /**
     * Asked at each mousedown: when it answers true, shift+drag with the left
     * button draws a rubber band and dispatches a KiCanvasBoxSelectEvent on
     * release.
     */
    public box_select_enabled: () => boolean = () => false;

    #pending: PendingMark[] = [];
    #flash_token = 0;
    #suppress_click = false;

    constructor(
        public canvas: HTMLCanvasElement,
        protected interactive = true,
    ) {
        super();
    }

    dispose() {
        this.disposables.dispose();
    }

    override addEventListener<K extends keyof KiCanvasEventMap>(
        type: K,
        listener:
            | ((this: Viewer, ev: KiCanvasEventMap[K]) => void)
            | { handleEvent: (ev: KiCanvasEventMap[K]) => void }
            | null,
        options?: boolean | AddEventListenerOptions,
    ): IDisposable;
    override addEventListener(
        type: string,
        listener: EventListener | null,
        options?: boolean | AddEventListenerOptions,
    ): IDisposable {
        super.addEventListener(type, listener, options);
        return {
            dispose: () => {
                this.removeEventListener(type, listener, options);
            },
        };
    }

    protected abstract create_renderer(canvas: HTMLCanvasElement): Renderer;

    async setup() {
        this.renderer = this.disposables.add(this.create_renderer(this.canvas));

        await this.renderer.setup();

        this.viewport = this.disposables.add(
            new Viewport(this.renderer, () => {
                this.on_viewport_change();
            }),
        );

        if (this.interactive) {
            this.viewport.enable_pan_and_zoom(0.5, 190);

            this.disposables.add(
                listen(this.canvas, "mousemove", (e) => {
                    this.on_mouse_change(e);
                }),
            );

            this.disposables.add(
                listen(this.canvas, "panzoom", (e) => {
                    this.on_mouse_change(e as MouseEvent);
                }),
            );

            this.disposables.add(
                listen(this.canvas, "click", (e) => {
                    // The click that ends a box select picks nothing.
                    if (this.#suppress_click) {
                        this.#suppress_click = false;
                        return;
                    }
                    const items = this.layers.query_point(this.mouse_position);
                    this.on_pick(this.mouse_position, items);
                }),
            );
        }

        // Box select is the host's explicit opt-in (box_select_enabled), so
        // it works even when the viewer is otherwise not interactive.
        this.#setup_box_select();

        this.setup_finished.open();
    }

    /**
     * Shift+drag with the left button draws a rubber band while box select
     * is enabled. Panning uses the middle and right buttons, so it is
     * unaffected.
     */
    #setup_box_select() {
        let start_screen: Vec2 | null = null;
        let start_world: Vec2 | null = null;

        const world_at = (e: MouseEvent) => {
            const rect = this.canvas.getBoundingClientRect();
            return this.viewport.camera.screen_to_world(
                new Vec2(e.clientX - rect.left, e.clientY - rect.top),
            );
        };

        this.disposables.add(
            listen(this.canvas, "mousedown", (e) => {
                this.#suppress_click = false;
                if (
                    !this.box_select_enabled() ||
                    e.button !== 0 ||
                    !e.shiftKey ||
                    !this.layers
                ) {
                    return;
                }
                e.preventDefault();
                start_screen = new Vec2(e.clientX, e.clientY);
                start_world = world_at(e);
            }),
        );

        // The drag may leave the canvas; follow it on the window.
        this.disposables.add(
            listen(window, "mousemove", (e) => {
                if (start_world) {
                    this.#paint_box_select(
                        BBox.from_points([start_world, world_at(e)]),
                    );
                }
            }),
        );

        this.disposables.add(
            listen(window, "mouseup", (e) => {
                if (!start_world || !start_screen) {
                    return;
                }
                const box = BBox.from_points([start_world, world_at(e)]);
                const dragged = new Vec2(e.clientX, e.clientY).sub(
                    start_screen,
                ).magnitude;
                start_world = null;
                start_screen = null;
                this.#paint_box_select(null);

                // Too short to be a drag: let it be a shift+click.
                if (dragged < box_select_min_drag) {
                    return;
                }

                this.#suppress_click = true;
                this.dispatchEvent(
                    new KiCanvasBoxSelectEvent(this.parts_in_box(box)),
                );
            }),
        );
    }

    #paint_box_select(box: BBox | null) {
        const layer = this.layers?.box_select;
        if (!layer) {
            return;
        }

        layer.clear();

        if (box) {
            // About 1.5 screen pixels, whatever the zoom.
            const width = 1.5 / this.viewport.camera.zoom;
            this.renderer.start_layer(layer.name);
            this.renderer.polygon(
                Polygon.from_BBox(box, mark_color.with_alpha(0.12)),
            );
            this.renderer.line(Polyline.from_BBox(box, width, mark_color));
            layer.graphics = this.renderer.end_layer();
        }

        this.draw();
    }

    /**
     * The bounding boxes of the parts (board footprints, schematic symbols)
     * with this reference in the shown document; empty when there are none.
     */
    public find_part_bboxes(reference: string): BBox[] {
        return [];
    }

    /**
     * The references of the parts whose bounding boxes intersect the box,
     * and the nets they touch, each sorted and listed once.
     */
    protected parts_in_box(box: BBox): BoxSelectDetails {
        return { references: [], nets: [] };
    }

    /**
     * Outline these parts with a dashed line, and label them, until the next
     * call. The marks are redrawn, against the new document, every time the
     * viewer paints one, so they survive reloads and sheet switches. Leaves
     * the selection and the camera alone.
     *
     * @returns how many of the distinct references are on the shown document
     */
    public set_pending(marks: PendingMark[]): number {
        const by_reference = new Map<string, PendingMark>();
        for (const mark of marks) {
            by_reference.set(mark.reference, mark);
        }
        this.#pending = [...by_reference.values()];
        const found = this.paint_pending();
        this.draw();
        return found;
    }

    /** Paint the pending marks against the shown document; does not draw. */
    protected paint_pending(): number {
        const layer = this.layers?.pending;
        if (!layer) {
            return 0;
        }

        layer.clear();

        const found = this.#pending
            .map((mark) => ({
                mark,
                boxes: this.find_part_bboxes(mark.reference),
            }))
            .filter(({ boxes }) => boxes.length > 0);

        if (found.length > 0) {
            this.renderer.start_layer(layer.name);
            for (const { mark, boxes } of found) {
                for (const bb of boxes) {
                    paint_dashed_box(this.renderer, bb, mark_color);
                }
                if (mark.label) {
                    paint_label(
                        this.renderer,
                        mark.label,
                        boxes[0]!,
                        mark_color,
                    );
                }
            }
            layer.graphics = this.renderer.end_layer();
        }

        return found.length;
    }

    /**
     * Highlight these parts once: a solid outline that fades out.
     *
     * @returns how many of the distinct references are on the shown document
     */
    public flash(references: string[]): number {
        const layer = this.layers?.flash;
        if (!layer) {
            return 0;
        }

        const token = ++this.#flash_token;
        const boxes: BBox[] = [];
        let found = 0;
        for (const reference of new Set(references)) {
            const part = this.find_part_bboxes(reference);
            if (part.length > 0) {
                found++;
                boxes.push(...part);
            }
        }

        layer.clear();
        layer.opacity = 1;

        if (boxes.length > 0) {
            this.renderer.start_layer(layer.name);
            for (const bb of boxes) {
                paint_solid_box(this.renderer, bb, mark_color);
            }
            layer.graphics = this.renderer.end_layer();
        }
        this.draw();

        if (found == 0) {
            return 0;
        }

        // A newer flash, or a repaint of the document, ends this one.
        const current = () =>
            token == this.#flash_token && this.layers?.flash === layer;

        const start = performance.now();
        const fade = (now: number) => {
            if (!current()) {
                return;
            }
            const t = (now - start) / flash_duration;
            if (t >= 1) {
                return;
            }
            // Hold, then fade out.
            layer.opacity = t < 0.3 ? 1 : 1 - (t - 0.3) / 0.7;
            this.draw();
            window.requestAnimationFrame(fade);
        };
        window.requestAnimationFrame(fade);

        window.setTimeout(() => {
            if (current()) {
                layer.clear();
                layer.opacity = 1;
                this.draw();
            }
        }, flash_duration);

        return found;
    }

    /**
     * Frame the union of these parts' bounding boxes, without selecting.
     *
     * @returns false, leaving the camera alone, when none is shown
     */
    public zoom_to_parts(references: string[]): boolean {
        if (!this.layers) {
            return false;
        }
        const boxes = references.flatMap((r) => this.find_part_bboxes(r));
        if (boxes.length == 0) {
            return false;
        }
        this.viewport.camera.bbox = BBox.combine(boxes).grow(10);
        this.draw();
        return true;
    }

    protected on_viewport_change() {
        if (this.interactive) {
            this.draw();
        }
    }

    protected on_mouse_change(e: MouseEvent) {
        const rect = this.canvas.getBoundingClientRect();
        const new_position = this.viewport.camera.screen_to_world(
            new Vec2(e.clientX - rect.left, e.clientY - rect.top),
        );

        if (
            this.mouse_position.x != new_position.x ||
            this.mouse_position.y != new_position.y
        ) {
            this.mouse_position.set(new_position);
            this.dispatchEvent(new KiCanvasMouseMoveEvent(this.mouse_position));
        }
    }

    public abstract load(src: any): Promise<void>;

    protected resolve_loaded(value: boolean) {
        if (value) {
            this.loaded.open();
            this.dispatchEvent(new KiCanvasLoadEvent());
        }
    }

    public abstract paint(): void;

    protected on_draw() {
        this.renderer.clear_canvas();

        if (!this.layers) {
            return;
        }

        // Render all layers in display order (back to front)
        let depth = 0.01;
        const camera = this.viewport.camera.matrix;
        const should_dim = this.layers.is_any_layer_highlighted();

        // TODO: donot flip drawing sheet and grid

        for (const layer of this.layers.in_display_order()) {
            if (layer.visible && layer.graphics) {
                let alpha = layer.opacity;

                if (should_dim && !layer.highlighted) {
                    alpha = 0.25;
                }

                layer.graphics.render(camera, depth, alpha);
                depth += 0.01;
            }
        }
    }

    public draw() {
        if (!this.viewport) {
            return;
        }

        window.requestAnimationFrame(() => {
            this.on_draw();
        });
    }

    protected on_pick(
        mouse: Vec2,
        items: ReturnType<ViewLayerSet["query_point"]>,
    ) {
        let selected = null;

        for (const { bbox } of items) {
            selected = bbox;
            break;
        }

        this.select(selected);
    }

    public select(item: BBox | null) {
        this.selected = item;
    }

    public get selected(): BBox | null {
        return this.#selected;
    }

    public set selected(bb: BBox | null) {
        this._set_selected(bb);
    }

    @no_self_recursion
    private _set_selected(bb: BBox | null) {
        const previous = this.#selected;
        this.#selected = bb?.copy() || null;

        // Notify event listeners
        this.dispatchEvent(
            new KiCanvasSelectEvent({
                item: this.#selected?.context,
                previous: previous?.context,
            }),
        );

        later(() => this.paint_selected());
    }

    public get selection_color() {
        return Color.white;
    }

    protected paint_selected() {
        const layer = this.layers.overlay;

        layer.clear();

        if (this.#selected) {
            const bb = this.#selected.copy().grow(this.#selected.w * 0.1);
            this.renderer.start_layer(layer.name);

            this.renderer.line(
                Polyline.from_BBox(bb, 0.254, this.selection_color),
            );

            this.renderer.polygon(Polygon.from_BBox(bb, this.selection_color));

            layer.graphics = this.renderer.end_layer();

            layer.graphics.composite_operation = "overlay";
        }

        this.draw();
    }

    abstract zoom_to_page(): void;

    zoom_to_selection() {
        if (!this.selected) {
            return;
        }
        this.viewport.camera.bbox = this.selected.grow(10);
        this.draw();
    }

    flip_view() {
        const flip = !this.viewport.camera.flipped;

        this.viewport.camera.flipped = flip;

        for (const layer of this.layers.in_order()) {
            if (layer.graphics) {
                layer.graphics.renderer.state.flipped = flip;
            }
        }

        // We need redraw some items because some items are not flippable
        // TODO: it re-paint all items and is inefficient
        this.paint();
        this.draw();
    }
}
