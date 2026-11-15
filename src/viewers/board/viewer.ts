/*
    Copyright (c) 2022 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { BBox, Vec2 } from "../../base/math";
import { is_string } from "../../base/types";
import { Renderer } from "../../graphics";
import { WebGL2Renderer } from "../../graphics/webgl";
import type { BoardTheme } from "../../kicad";
import * as kicad_common from "../../kicad/common";
import * as board_items from "../../kicad/board";
import { DocumentViewer } from "../base/document-viewer";
import { LayerNames, LayerSet, ViewLayer } from "./layers";
import { BoardPainter } from "./painter";

export type ContextMenuCallback = (
    screenX: number,
    screenY: number,
    items: Map<string, unknown>,
    onSelect: (item: unknown) => void,
) => void;

export class BoardViewer extends DocumentViewer<
    board_items.KicadPCB,
    BoardPainter,
    LayerSet,
    BoardTheme
> {
    #contextMenuCallback: ContextMenuCallback | null = null;

    get board(): board_items.KicadPCB {
        return this.document;
    }

    set contextMenuCallback(callback: ContextMenuCallback | null) {
        this.#contextMenuCallback = callback;
    }

    protected override create_renderer(canvas: HTMLCanvasElement): Renderer {
        const renderer = new WebGL2Renderer(canvas);
        return renderer;
    }

    protected override create_painter() {
        return new BoardPainter(this.renderer, this.layers, this.theme);
    }

    protected override create_layer_set() {
        return new LayerSet(this.board, this.theme);
    }

    protected override get grid_origin() {
        return this.board.setup?.grid_origin ?? new Vec2(0, 0);
    }

    protected override on_pick(
        mouse: Vec2,
        items: Generator<{ layer: ViewLayer; bbox: BBox }, void, unknown>,
    ): void {
        const selectableItems = new Map<string, unknown>();
        for (const { bbox } of items) {
            const item = bbox.context;
            if (item instanceof board_items.Footprint) {
                selectableItems.set(`Footprint: ${item.reference}`, item);
            } else if (kicad_common.isNetInfo(item)) {
                selectableItems.set(`Net: ${item.netname}`, item);
            } else {
                console.log(item);
            }
        }

        if (selectableItems.size === 0) {
            this.select(null);
        } else if (selectableItems.size === 1 || !this.#contextMenuCallback) {
            this.handleItemClick(selectableItems.values().next().value);
        } else {
            const { x, y } = this.viewport.camera.world_to_screen(mouse);
            this.#contextMenuCallback(x, y, selectableItems, (selected) => {
                this.handleItemClick(selected);
            });
        }
    }

    handleItemClick(item: unknown) {
        if (item instanceof board_items.Footprint) {
            this.select(item);
        } else if (kicad_common.isNetInfo(item)) {
            this.highlight_net(kicad_common.getNetNumber(item));
        }
    }

    override select(item: board_items.Footprint | string | BBox | null) {
        // If item is a string, find the footprint by uuid or reference.
        if (is_string(item)) {
            item = this.board.find_footprint(item);
        }

        // If it's a footprint, use the footprint's nominal bounding box.
        if (item instanceof board_items.Footprint) {
            item = item.bbox;
        }

        super.select(item);
    }

    override find_part_bboxes(reference: string): BBox[] {
        return (this.board?.footprints ?? [])
            .filter((fp) => fp.reference === reference)
            .map((fp) => fp.bbox);
    }

    protected override parts_in_box(box: BBox) {
        const references = new Set<string>();
        const nets = new Set<string>();
        for (const fp of this.board?.footprints ?? []) {
            if (!fp.reference || !fp.bbox.intersects(box)) {
                continue;
            }
            references.add(fp.reference);
            for (const pad of fp.pads) {
                if (pad.net?.name) {
                    nets.add(pad.net.name);
                }
            }
        }
        return { references: [...references].sort(), nets: [...nets].sort() };
    }

    /**
     * Highlight the net with the given name and frame everything on it.
     * Returns false when the board has no such net.
     */
    focus_net(name: string): boolean {
        const net = this.board.nets.find((n) => n.name === name);
        if (!net) {
            return false;
        }

        const on_net = (item: unknown) => {
            if (item instanceof board_items.Footprint) {
                return item.pads.some((pad) => pad.net?.name === name);
            }
            return (
                typeof item === "object" &&
                item !== null &&
                kicad_common.isNetInfo(item) &&
                (item as { netname?: string }).netname === name
            );
        };

        const boxes: BBox[] = [];
        for (const layer of this.layers.in_order()) {
            for (const [item, bbox] of layer.bboxes) {
                if (on_net(item)) {
                    boxes.push(bbox);
                }
            }
        }

        if (boxes.length > 0) {
            const bbox = BBox.combine(boxes);
            this.viewport.camera.bbox = bbox.grow(
                Math.max(bbox.w, bbox.h) * 0.1 + 1,
            );
        }

        this.highlight_net(net.number);
        return true;
    }

    highlight_net(net: number) {
        this.painter.paint_net(this.board, net);
        this.draw();
    }

    private set_layers_opacity(layers: Generator<ViewLayer>, opacity: number) {
        for (const layer of layers) {
            layer.opacity = opacity;
        }
        this.draw();
    }

    set track_opacity(value: number) {
        this.set_layers_opacity(
            (this.layers as LayerSet).copper_layers(),
            value,
        );
    }

    set via_opacity(value: number) {
        this.set_layers_opacity((this.layers as LayerSet).via_layers(), value);
    }

    set zone_opacity(value: number) {
        this.set_layers_opacity((this.layers as LayerSet).zone_layers(), value);
    }

    set pad_opacity(value: number) {
        this.set_layers_opacity((this.layers as LayerSet).pad_layers(), value);
    }

    set pad_hole_opacity(value: number) {
        this.set_layers_opacity(
            (this.layers as LayerSet).pad_hole_layers(),
            value,
        );
    }

    set grid_opacity(value: number) {
        this.set_layers_opacity((this.layers as LayerSet).grid_layers(), value);
    }

    set page_opacity(value: number) {
        this.layers.by_name(LayerNames.drawing_sheet)!.opacity = value;
        this.draw();
    }

    zoom_to_board() {
        const edge_cuts = this.layers.by_name(LayerNames.edge_cuts)!;
        const board_bbox = edge_cuts.bbox;
        this.viewport.camera.bbox = board_bbox.grow(board_bbox.w * 0.1);
    }
}
