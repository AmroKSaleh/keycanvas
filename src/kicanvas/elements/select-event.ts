/*
    Copyright (c) 2024 KeyLife.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { Footprint } from "../../kicad/board";
import { SchematicSymbol } from "../../kicad/schematic";

/**
 * Public selection-event API for keycanvas.
 *
 * These events are dispatched by the <kicanvas-embed> element so host
 * applications can react when the user selects a footprint (board) or a
 * symbol (schematic). See docs/embedding.md for usage.
 */

/** Type of item a selection refers to. */
export type SelectItemType = "footprint" | "symbol";

/**
 * Detail payload for the `kicanvas:select` event.
 *
 * `fields` is the item's full property/field map (e.g. MPN, Manufacturer,
 * Datasheet) so a consumer can read arbitrary metadata off the selection.
 */
export interface KiCanvasSelectDetail {
    itemType: SelectItemType;
    reference: string | null;
    value: string | null;
    fields: Record<string, string>;
    sheet?: string;
}

/** Event name dispatched when a footprint/symbol is selected. */
export const KICANVAS_SELECT_EVENT = "kicanvas:select";

/** Event name dispatched when the selection is cleared. */
export const KICANVAS_DESELECT_EVENT = "kicanvas:deselect";

function non_empty(value: string | null | undefined): string | null {
    return value === undefined || value === null || value === "" ? null : value;
}

/**
 * Pure mapping from a selected viewer item to the public select-event detail.
 *
 * Accepts the raw object carried by the viewer's internal selection (the
 * bounding box `context`), which is a {@link Footprint} for boards or a
 * {@link SchematicSymbol} for schematics. Returns `null` for anything that
 * isn't a footprint or symbol (e.g. a schematic sheet or a net), so callers
 * can decide not to emit a selection event for those.
 *
 * @param item - the selected item (bbox context) or null.
 * @param opts.sheet - optional sheet name to attach to the payload.
 */
export function build_select_detail(
    item: unknown,
    opts?: { sheet?: string | null },
): KiCanvasSelectDetail | null {
    const sheet = non_empty(opts?.sheet);

    if (item instanceof Footprint) {
        const fields: Record<string, string> = {};
        for (const [name, prop] of Object.entries(item.properties)) {
            if (prop?.value !== undefined) {
                fields[name] = prop.value;
            }
        }

        const detail: KiCanvasSelectDetail = {
            itemType: "footprint",
            reference: non_empty(item.reference),
            value: non_empty(item.value),
            fields,
        };

        const fp_sheet = sheet ?? non_empty(item.sheetname);
        if (fp_sheet !== null) {
            detail.sheet = fp_sheet;
        }

        return detail;
    }

    if (item instanceof SchematicSymbol) {
        const fields: Record<string, string> = {};
        for (const [name, prop] of item.properties) {
            if (prop?.text !== undefined) {
                fields[name] = prop.text;
            }
        }

        const detail: KiCanvasSelectDetail = {
            itemType: "symbol",
            reference: non_empty(item.reference),
            value: non_empty(item.value),
            fields,
        };

        if (sheet !== null) {
            detail.sheet = sheet;
        }

        return detail;
    }

    return null;
}
