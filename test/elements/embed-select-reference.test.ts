/*
    Copyright (c) 2024 KeyLife.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { assert } from "chai";
import "../../src/kicanvas/elements/kicanvas-shell";
import "../../src/kicanvas/elements/kicanvas-embed";
import type { KiCanvasSelectDetail } from "../../src/kicanvas/elements/select-event";
import root_src from "../kicanvas/files/hier_root.kicad_sch";
import child_src from "../kicanvas/files/hier_child.kicad_sch";

type Embed = HTMLElement & {
    selectReference(
        reference: string,
        opts?: { zoom?: boolean },
    ): Promise<boolean>;
};

function source(name: string, text: string) {
    const elm = document.createElement("kicanvas-source");
    elm.setAttribute("name", name);
    elm.textContent = text;
    return elm;
}

/** Mounts an embed with the two-placement fixture and collects its select events. */
function mount(controls?: "full") {
    const embed = document.createElement("kicanvas-embed") as Embed;
    if (controls) {
        embed.setAttribute("controls", controls);
    }
    embed.style.width = "800px";
    embed.style.height = "600px";
    embed.append(
        source("hier_root.kicad_sch", root_src),
        source("hier_child.kicad_sch", child_src),
    );
    const selected: KiCanvasSelectDetail[] = [];
    // Every select/deselect in order, to catch a selection being cleared.
    const events: string[] = [];
    embed.addEventListener("kicanvas:select", (e) => {
        const detail = (e as unknown as CustomEvent<KiCanvasSelectDetail>)
            .detail;
        selected.push(detail);
        events.push(`select ${detail.reference}`);
    });
    embed.addEventListener("kicanvas:deselect", () => events.push("deselect"));
    document.body.append(embed);
    return { embed, selected, events };
}

suite("kicanvas.embed.selectReference", function () {
    this.timeout(20000);

    let embed: Embed;
    teardown(() => embed?.remove());

    test("selects a symbol on the root sheet and emits kicanvas:select", async function () {
        const m = mount();
        embed = m.embed;

        assert.isTrue(await embed.selectReference("R5"));

        assert.equal(m.selected.at(-1)?.reference, "R5");
        assert.equal(m.selected.at(-1)?.sheet, "Root");
    });

    test("switches to the sheet placement that shows the reference", async function () {
        const m = mount();
        embed = m.embed;

        assert.isTrue(await embed.selectReference("R101"));
        assert.equal(m.selected.at(-1)?.reference, "R101");
        assert.equal(m.selected.at(-1)?.sheet, "Channel B");

        assert.isTrue(await embed.selectReference("R1"));
        assert.equal(m.selected.at(-1)?.reference, "R1");
        assert.equal(m.selected.at(-1)?.sheet, "Channel A");
    });

    test("switches sheets with a part selected while the full controls are shown", async function () {
        // The symbols panel re-renders on every page load; it must not throw
        // while the viewer clears the old selection (that left a blank canvas).
        const m = mount("full");
        embed = m.embed;

        assert.isTrue(await embed.selectReference("R5"));
        assert.isTrue(await embed.selectReference("R101"));
        assert.equal(m.selected.at(-1)?.reference, "R101");
    });

    test("keeps the selection when called while the first sheet is still loading", async function () {
        // Called right away, the switch to Channel B races the root sheet's
        // first load; that load finishing must not count as the switch, or
        // the Channel B load clears the selection afterwards.
        const m = mount();
        embed = m.embed;

        assert.isTrue(await embed.selectReference("R101"));
        await new Promise((r) => setTimeout(r, 500));

        assert.equal(m.events.at(-1), "select R101");
    });

    test("resolves false for a reference that isn't in the schematic", async function () {
        const m = mount();
        embed = m.embed;

        assert.isFalse(await embed.selectReference("R999"));
        assert.deepEqual(m.selected, []);
    });
});
