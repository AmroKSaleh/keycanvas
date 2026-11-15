/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { first } from "../../base/iterator";
import { BBox } from "../../base/math";
import { is_string } from "../../base/types";
import { Renderer } from "../../graphics";
import { Canvas2DRenderer } from "../../graphics/canvas2d";
import type { SchematicTheme } from "../../kicad";
import {
    KicadSch,
    SchematicSheet,
    SchematicSymbol,
} from "../../kicad/schematic";
import type { ProjectPage } from "../../kicanvas/project";
import { DocumentViewer } from "../base/document-viewer";
import { LayerSet } from "./layers";
import { SchematicPainter } from "./painter";

export class SchematicViewer extends DocumentViewer<
    KicadSch,
    SchematicPainter,
    LayerSet,
    SchematicTheme
> {
    get schematic(): KicadSch {
        return this.document;
    }

    override create_renderer(canvas: HTMLCanvasElement): Renderer {
        const renderer = new Canvas2DRenderer(canvas);
        renderer.state.fill = this.theme.note;
        renderer.state.stroke = this.theme.note;
        renderer.state.stroke_width = 0.1524;
        return renderer;
    }

    override async load(src: KicadSch | ProjectPage) {
        if (src instanceof KicadSch) {
            return await super.load(src);
        }

        this.document = null!;

        const doc = src.document as KicadSch;
        doc.update_hierarchical_data(src.sheet_path);

        return await super.load(doc);
    }

    protected override create_painter() {
        return new SchematicPainter(this.renderer, this.layers, this.theme);
    }

    protected override create_layer_set() {
        return new LayerSet(this.theme);
    }

    /** Every unit of a multi-unit symbol on this sheet has a box. */
    override find_part_bboxes(reference: string): BBox[] {
        const boxes: BBox[] = [];
        for (const symbol of this.schematic?.symbols.values() ?? []) {
            if (symbol.reference !== reference) {
                continue;
            }
            const bbox = first(this.layers.query_item_bboxes(symbol));
            if (bbox) {
                boxes.push(bbox);
            }
        }
        return boxes;
    }

    /**
     * Power symbols (references starting with #) are left out. Nets here are
     * the names of the net, global and hierarchical labels inside the box.
     */
    protected override parts_in_box(box: BBox) {
        const references = new Set<string>();
        for (const layer of this.layers.interactive_layers()) {
            for (const [item, bbox] of layer.bboxes) {
                if (
                    item instanceof SchematicSymbol &&
                    item.reference &&
                    !item.reference.startsWith("#") &&
                    bbox.intersects(box)
                ) {
                    references.add(item.reference);
                }
            }
        }

        const nets = new Set<string>();
        const labels = [
            ...this.schematic.net_labels,
            ...this.schematic.global_labels,
            ...this.schematic.hierarchical_labels,
        ];
        for (const label of labels) {
            if (label.shown_text && box.contains_point(label.at.position)) {
                nets.add(label.shown_text);
            }
        }

        return { references: [...references].sort(), nets: [...nets].sort() };
    }

    public override select(
        item: SchematicSymbol | SchematicSheet | string | BBox | null,
    ): void {
        // If item is a string, find the symbol by uuid or reference.
        if (is_string(item)) {
            item =
                this.schematic.find_symbol(item) ??
                this.schematic.find_sheet(item);
        }

        // If it's a symbol or sheet, find the bounding box for it.
        if (item instanceof SchematicSymbol || item instanceof SchematicSheet) {
            const bboxes = this.layers.query_item_bboxes(item);
            item = first(bboxes) ?? null;
        }

        super.select(item);
    }
}
