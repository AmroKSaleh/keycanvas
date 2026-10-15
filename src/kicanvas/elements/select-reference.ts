/*
    Copyright (c) 2024 KeyLife.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { KicadSch, SchematicSymbol } from "../../kicad/schematic";
import type { Project, ProjectPage } from "../project";

/**
 * Where a reference designator lives in a project: the schematic page
 * (sheet placement) that shows it and the symbol's uuid on that page.
 */
export interface ReferenceLocation {
    page: ProjectPage;
    uuid: string;
}

/**
 * The reference a symbol has on one sheet placement, without touching the
 * document. Mirrors KicadSch.update_hierarchical_data's lookup order, which
 * the viewer applies (mutating the shared document) when it shows a page.
 */
function reference_at(
    root: KicadSch | undefined,
    doc: KicadSch,
    sym: SchematicSymbol,
    sheet_path: string,
): string | undefined {
    const symbol_path = `${sheet_path}/${sym.uuid}`;
    const instance =
        root?.symbol_instances?.get(symbol_path) ??
        doc.symbol_instances?.get(symbol_path) ??
        sym.instances.get(sheet_path);
    return instance?.reference ?? sym.reference;
}

/**
 * Finds the schematic page showing `reference` (e.g. "R12"). A sheet placed
 * more than once gives its symbols a different reference per placement, so
 * each page is checked against its own sheet path. Returns null when no
 * page shows the reference.
 */
export function find_reference(
    project: Project,
    reference: string,
): ReferenceLocation | null {
    if (!reference) {
        return null;
    }

    const root = project.root_schematic_page?.document as KicadSch | undefined;

    for (const page of project.pages()) {
        const doc = page.document;
        if (page.type !== "schematic" || !(doc instanceof KicadSch)) {
            continue;
        }
        for (const sym of doc.symbols.values()) {
            if (reference_at(root, doc, sym, page.sheet_path) === reference) {
                return { page, uuid: sym.uuid };
            }
        }
    }

    return null;
}
