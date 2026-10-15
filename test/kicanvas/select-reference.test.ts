/*
    Copyright (c) 2024 KeyLife.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { assert } from "chai";
import { Project } from "../../src/kicanvas/project";
import { LocalFileSystem } from "../../src/kicanvas/services/vfs";
import { find_reference } from "../../src/kicanvas/elements/select-reference";
import root_src from "./files/hier_root.kicad_sch";
import child_src from "./files/hier_child.kicad_sch";

const ROOT = "aaaaaaaa-0000-0000-0000-000000000001";
const SHEET_A = "bbbbbbbb-0000-0000-0000-00000000000a";
const SHEET_B = "bbbbbbbb-0000-0000-0000-00000000000b";
const CHILD_R = "eeeeeeee-0000-0000-0000-000000000001";

/**
 * A root sheet holding R5 plus two placements of one child sheet. The
 * child's single resistor is R1 in "Channel A" and R101 in "Channel B".
 */
async function load_project() {
    const project = new Project();
    await project.load(
        new LocalFileSystem([
            new File([root_src], "hier_root.kicad_sch"),
            new File([child_src], "hier_child.kicad_sch"),
        ]),
    );
    return project;
}

suite("kicanvas.select-reference", function () {
    test("finds a symbol on the root sheet", async function () {
        const project = await load_project();

        const found = find_reference(project, "R5");

        assert.isNotNull(found);
        assert.equal(found!.page.sheet_path, `/${ROOT}`);
        assert.equal(found!.uuid, "cccccccc-0000-0000-0000-000000000001");
    });

    test("finds each placement of a repeated sheet by its own reference", async function () {
        const project = await load_project();

        const a = find_reference(project, "R1");
        const b = find_reference(project, "R101");

        assert.equal(a!.page.sheet_path, `/${ROOT}/${SHEET_A}`);
        assert.equal(a!.page.name, "Channel A");
        assert.equal(a!.uuid, CHILD_R);
        assert.equal(b!.page.sheet_path, `/${ROOT}/${SHEET_B}`);
        assert.equal(b!.page.name, "Channel B");
        assert.equal(b!.uuid, CHILD_R);
    });

    test("does not depend on which page was loaded last", async function () {
        const project = await load_project();
        // Viewing Channel B rewrites the shared child document's references
        // to R101; R1 must still resolve to Channel A.
        const child = project.page_by_path(
            `hier_child.kicad_sch:/${ROOT}/${SHEET_B}`,
        )!;
        (
            child.document as { update_hierarchical_data(p: string): void }
        ).update_hierarchical_data(child.sheet_path);

        assert.equal(
            find_reference(project, "R1")!.page.sheet_path,
            `/${ROOT}/${SHEET_A}`,
        );
    });

    test("is case-sensitive and returns null for unknown references", async function () {
        const project = await load_project();

        assert.isNull(find_reference(project, "R999"));
        assert.isNull(find_reference(project, "r5"));
        assert.isNull(find_reference(project, ""));
    });
});
