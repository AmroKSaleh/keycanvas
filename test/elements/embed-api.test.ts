/*
    Copyright (c) 2026 KeyLife.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { assert } from "chai";

import "../../src/kicanvas/elements/kc-board/app";
import "../../src/kicanvas/elements/kc-schematic/app";
import "../../src/kicanvas/elements/kicanvas-embed";

import type { KiCanvasSelectDetail } from "../../src/kicanvas/elements/select-event";
import { Vec2 } from "../../src/base/math";
import type { Viewer } from "../../src/viewers/base/viewer";
import empty_pcb_src from "../kicad/files/empty.kicad_pcb";
import symbols_sch_src from "../kicad/files/symbols.kicad_sch";

/** The public host API this suite pins down (docs/docs/embedding.md). */
interface EmbedApi extends HTMLElement {
    loaded: boolean;
    reload(): Promise<void>;
    select(reference: string): boolean;
    focusNet(name: string): boolean;
    setPending(items: { reference: string; label?: string }[]): number;
    flash(references: string[]): number;
    zoomTo(references: string[]): boolean;
}

function footprint(n: number, reference: string, value: string, x: number) {
    const id = `00000000-0000-0000-0000-00000000000${n}`;
    return `
  (footprint "Resistor_SMD:R_0603" (layer "F.Cu") (tstamp ${id}) (at ${x} 50)
    (fp_text reference "${reference}" (at 0 -1.5) (layer "F.SilkS")
      (effects (font (size 1 1) (thickness 0.15))))
    (fp_text value "${value}" (at 0 1.5) (layer "F.Fab")
      (effects (font (size 1 1) (thickness 0.15))))
    (pad "1" smd rect (at -1 0) (size 1 1) (layers "F.Cu" "F.Mask") (net 1 "GND"))
    (pad "2" smd rect (at 1 0) (size 1 1) (layers "F.Cu" "F.Mask") (net 2 "VCC"))
  )`;
}

/** A board with R1 (value given) and C1, a GND and a VCC net, and a VCC track. */
function board(r1_value: string, with_c1 = true) {
    const parts = `
  (net 1 "GND")
  (net 2 "VCC")
  ${footprint(1, "R1", r1_value, 40)}
  ${with_c1 ? footprint(2, "C1", "100n", 160) : ""}
  (segment (start 41 50) (end 159 50) (width 0.25) (layer "F.Cu") (net 2))
`;
    const end = empty_pcb_src.lastIndexOf(")");
    return empty_pcb_src.slice(0, end) + parts + ")\n";
}

let fetched: string[] = [];
let served = "";
const real_fetch = window.fetch;

function stub_fetch() {
    fetched = [];
    window.fetch = async (input: RequestInfo | URL) => {
        const url = input instanceof Request ? input.url : String(input);
        fetched.push(url);
        return new Response(served, { status: 200 });
    };
}

async function wait_for(what: string, cond: () => boolean, ms = 5000) {
    const start = Date.now();
    while (!cond()) {
        if (Date.now() - start > ms) {
            throw new Error(`Timed out waiting for ${what}`);
        }
        await new Promise((r) => setTimeout(r, 10));
    }
}

function viewer_of(embed: EmbedApi, app: "kc-board-app" | "kc-schematic-app") {
    const elm = embed.shadowRoot?.querySelector(app) as
        | (HTMLElement & { viewer: Viewer })
        | null;
    return elm?.viewer;
}

async function mount(
    app: "kc-board-app" | "kc-schematic-app",
    source: { src: string } | { name: string; text: string },
    before_load?: (embed: EmbedApi) => void,
) {
    const host = document.createElement("div");
    host.style.width = "800px";
    host.style.height = "600px";
    const embed = document.createElement("kicanvas-embed") as EmbedApi;
    embed.setAttribute("controls", "none");
    if ("src" in source) {
        embed.setAttribute("src", source.src);
    } else {
        const inline = document.createElement("kicanvas-source");
        inline.setAttribute("name", source.name);
        inline.textContent = source.text;
        embed.appendChild(inline);
    }
    host.appendChild(embed);
    document.body.appendChild(host);
    before_load?.(embed);
    await wait_for("the embed to load", () => embed.loaded);
    await wait_for(
        "the viewer to load",
        () => viewer_of(embed, app)?.loaded.isOpen === true,
    );
    // The viewer positions its camera one task after it reports loaded.
    await new Promise((r) => setTimeout(r, 50));
    return { host, embed, viewer: () => viewer_of(embed, app)! };
}

function events(embed: EmbedApi) {
    const seen: { type: string; detail?: KiCanvasSelectDetail }[] = [];
    embed.addEventListener("kicanvas:select", (e) =>
        seen.push({
            type: "select",
            detail: (e as unknown as CustomEvent<KiCanvasSelectDetail>).detail,
        }),
    );
    embed.addEventListener("kicanvas:deselect", () =>
        seen.push({ type: "deselect" }),
    );
    return seen;
}

suite("kicanvas.embed public API", function () {
    this.timeout(20000);

    let host: HTMLElement | null = null;

    teardown(async function () {
        window.fetch = real_fetch;
        // Let draws the test queued land before the viewer is disposed, or
        // they fail against a released WebGL context in the next test.
        await new Promise((r) => setTimeout(r, 50));
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        host?.remove();
        host = null;
    });

    test("reload() refetches its source and keeps the view", async function () {
        stub_fetch();
        served = board("10k");
        const m = await mount("kc-board-app", { src: "board.kicad_pcb" });
        host = m.host;

        const camera = m.viewer().viewport.camera;
        camera.center.set(42, 51);
        camera.zoom = 7.5;

        served = board("22k");
        m.embed.setAttribute("src", "board.kicad_pcb?t=2");
        await m.embed.reload();
        await new Promise((r) => setTimeout(r, 50));

        assert.lengthOf(fetched, 2);
        assert.match(fetched[1]!, /board\.kicad_pcb\?t=2$/);

        const viewer = m.viewer() as Viewer & {
            board: { find_footprint(r: string): { value: string } | null };
        };
        assert.equal(viewer.board.find_footprint("R1")?.value, "22k");
        assert.equal(viewer.viewport.camera.center.x, 42);
        assert.equal(viewer.viewport.camera.center.y, 51);
        assert.equal(viewer.viewport.camera.zoom, 7.5);
    });

    test("reload() keeps the selected part selected, with its new fields", async function () {
        stub_fetch();
        served = board("10k");
        const m = await mount("kc-board-app", { src: "board.kicad_pcb" });
        host = m.host;
        const seen = events(m.embed);

        assert.isTrue(m.embed.select("R1"));
        served = board("22k");
        await m.embed.reload();

        assert.deepEqual(
            seen.map((e) => e.type),
            ["select", "select"],
        );
        assert.equal(seen[1]!.detail!.value, "22k");
        assert.isNotNull(m.viewer().selected);
    });

    test("reload() clears a selection whose part is gone", async function () {
        stub_fetch();
        served = board("10k");
        const m = await mount("kc-board-app", { src: "board.kicad_pcb" });
        host = m.host;
        const seen = events(m.embed);

        assert.isTrue(m.embed.select("C1"));
        served = board("10k", false);
        await m.embed.reload();

        assert.deepEqual(
            seen.map((e) => e.type),
            ["select", "deselect"],
        );
        assert.isNull(m.viewer().selected);
    });

    test("select() selects and zooms on a board footprint", async function () {
        stub_fetch();
        served = board("10k");
        const m = await mount("kc-board-app", { src: "board.kicad_pcb" });
        host = m.host;
        const seen = events(m.embed);
        const camera = m.viewer().viewport.camera;
        const zoom_before = camera.zoom;

        assert.isTrue(m.embed.select("C1"));

        assert.equal(seen.length, 1);
        assert.equal(seen[0]!.detail!.reference, "C1");
        const selected = m.viewer().selected!;
        assert.isTrue(selected.contains_point(camera.center));
        assert.isAbove(camera.zoom, zoom_before);
    });

    test("select() of an unknown reference returns false and keeps the selection", async function () {
        stub_fetch();
        served = board("10k");
        const m = await mount("kc-board-app", { src: "board.kicad_pcb" });
        host = m.host;

        assert.isTrue(m.embed.select("R1"));
        const seen = events(m.embed);

        assert.isFalse(m.embed.select("U99"));
        assert.lengthOf(seen, 0);
        assert.isNotNull(m.viewer().selected);
    });

    test("select() selects and zooms on a schematic symbol", async function () {
        const m = await mount("kc-schematic-app", {
            name: "symbols.kicad_sch",
            text: symbols_sch_src,
        });
        host = m.host;
        const seen = events(m.embed);

        assert.isTrue(m.embed.select("C2"));

        assert.equal(seen[0]!.detail!.itemType, "symbol");
        assert.equal(seen[0]!.detail!.reference, "C2");
        const camera = m.viewer().viewport.camera;
        assert.isTrue(m.viewer().selected!.contains_point(camera.center));
    });

    test("select() before anything is loaded returns false", function () {
        const embed = document.createElement("kicanvas-embed") as EmbedApi;
        assert.isFalse(embed.select("R1"));
        assert.isFalse(embed.focusNet("GND"));
    });

    test("focusNet() highlights a board net and frames it", async function () {
        stub_fetch();
        served = board("10k");
        const m = await mount("kc-board-app", { src: "board.kicad_pcb" });
        host = m.host;

        assert.isTrue(m.embed.focusNet("VCC"));

        const viewer = m.viewer() as Viewer & {
            layers: { overlay: { graphics?: unknown } };
        };
        assert.exists(viewer.layers.overlay.graphics);
        const center = viewer.viewport.camera.center;
        // VCC runs from R1's pad (x 41) to C1's pad (x 159) along y 50.
        assert.closeTo(center.x, 100, 5);
        assert.closeTo(center.y, 50, 5);
    });

    test("focusNet() of an unknown net returns false", async function () {
        stub_fetch();
        served = board("10k");
        const m = await mount("kc-board-app", { src: "board.kicad_pcb" });
        host = m.host;

        assert.isFalse(m.embed.focusNet("NOPE"));
    });
});

/** Fire a shift+drag (or a plain drag) from one world point to another. */
function drag(viewer: Viewer, from: Vec2, to: Vec2, shiftKey = true) {
    const rect = viewer.canvas.getBoundingClientRect();
    const client = (p: Vec2) => {
        const s = viewer.viewport.camera.world_to_screen(p);
        return { clientX: rect.left + s.x, clientY: rect.top + s.y };
    };
    const init = { bubbles: true, button: 0, shiftKey };
    viewer.canvas.dispatchEvent(
        new MouseEvent("mousedown", { ...init, ...client(from) }),
    );
    window.dispatchEvent(
        new MouseEvent("mousemove", { ...init, ...client(to) }),
    );
    window.dispatchEvent(new MouseEvent("mouseup", { ...init, ...client(to) }));
    viewer.canvas.dispatchEvent(
        new MouseEvent("click", { ...init, ...client(to) }),
    );
}

interface BoxSelectDetail {
    references: string[];
    nets: string[];
}

function box_events(embed: EmbedApi) {
    const seen: BoxSelectDetail[] = [];
    embed.addEventListener("kicanvas:boxselect", (e) =>
        seen.push((e as CustomEvent<BoxSelectDetail>).detail),
    );
    return seen;
}

suite("kicanvas.embed host marks", function () {
    this.timeout(20000);

    let host: HTMLElement | null = null;

    teardown(async function () {
        window.fetch = real_fetch;
        await new Promise((r) => setTimeout(r, 50));
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        host?.remove();
        host = null;
    });

    async function mount_board(before_load?: (embed: EmbedApi) => void) {
        stub_fetch();
        served = board("10k");
        const m = await mount(
            "kc-board-app",
            { src: "board.kicad_pcb" },
            before_load,
        );
        host = m.host;
        return m;
    }

    test("setPending() counts the parts it found and clears with []", async function () {
        const m = await mount_board();
        const seen = events(m.embed);
        const camera = m.viewer().viewport.camera;
        const center = camera.center.copy();
        const zoom = camera.zoom;

        assert.equal(
            m.embed.setPending([
                { reference: "R1", label: "MPN staged" },
                { reference: "C1" },
                { reference: "U99" },
            ]),
            2,
        );
        assert.exists(m.viewer().layers.pending.graphics);

        // Neither the selection nor the camera moves.
        assert.lengthOf(seen, 0);
        assert.notExists(m.viewer().selected);
        assert.equal(camera.zoom, zoom);
        assert.isTrue(camera.center.equals(center));

        assert.equal(m.embed.setPending([]), 0);
        assert.notExists(m.viewer().layers.pending.graphics);
    });

    test("setPending() replaces the previous set and counts each reference once", async function () {
        const m = await mount_board();

        assert.equal(m.embed.setPending([{ reference: "R1" }]), 1);
        assert.equal(
            m.embed.setPending([{ reference: "C1" }, { reference: "C1" }]),
            1,
        );
        assert.equal(m.embed.setPending([{ reference: "U99" }]), 0);
        assert.notExists(m.viewer().layers.pending.graphics);
    });

    test("setPending() survives reload(), re-resolved against the new board", async function () {
        const m = await mount_board();
        assert.equal(m.embed.setPending([{ reference: "C1" }]), 1);
        const before = m.viewer().layers;

        served = board("22k", false);
        await m.embed.reload();
        assert.notStrictEqual(m.viewer().layers, before);
        assert.notExists(m.viewer().layers.pending.graphics);

        served = board("22k", true);
        await m.embed.reload();
        assert.exists(m.viewer().layers.pending.graphics);
    });

    test("setPending() before the viewer loads marks the document it loads", async function () {
        const m = await mount_board((embed) => {
            assert.equal(embed.setPending([{ reference: "R1" }]), 0);
        });

        assert.exists(m.viewer().layers.pending.graphics);
    });

    test("setPending() marks schematic symbols on the shown sheet", async function () {
        const m = await mount("kc-schematic-app", {
            name: "symbols.kicad_sch",
            text: symbols_sch_src,
        });
        host = m.host;

        assert.equal(
            m.embed.setPending([
                { reference: "C1", label: "MPN staged" },
                { reference: "C2" },
                { reference: "R9" },
            ]),
            2,
        );
        assert.exists(m.viewer().layers.pending.graphics);
    });

    test("flash() counts the parts it found and fades out", async function () {
        const m = await mount_board();

        assert.equal(m.embed.flash(["R1", "C1", "U99"]), 2);
        assert.exists(m.viewer().layers.flash.graphics);

        await wait_for(
            "the flash to fade",
            () => !m.viewer().layers.flash.graphics,
            3000,
        );
        assert.equal(m.embed.flash(["U99"]), 0);
        assert.notExists(m.viewer().layers.flash.graphics);
    });

    test("zoomTo() frames the parts together without selecting", async function () {
        const m = await mount_board();
        const seen = events(m.embed);
        const camera = m.viewer().viewport.camera;

        assert.isTrue(m.embed.zoomTo(["R1", "C1"]));
        // R1 sits at x 40 and C1 at x 160, both on y 50.
        assert.closeTo(camera.center.x, 100, 2);
        assert.closeTo(camera.center.y, 50, 2);
        assert.lengthOf(seen, 0);
        assert.notExists(m.viewer().selected);

        const center = camera.center.copy();
        const zoom = camera.zoom;
        assert.isFalse(m.embed.zoomTo(["U99"]));
        assert.isFalse(m.embed.zoomTo([]));
        assert.isTrue(camera.center.equals(center));
        assert.equal(camera.zoom, zoom);
    });

    test("boxselect: shift+drag names the footprints and their nets", async function () {
        const m = await mount_board();
        m.embed.setAttribute("boxselect", "");
        const boxes = box_events(m.embed);
        const seen = events(m.embed);

        drag(m.viewer(), new Vec2(35, 45), new Vec2(45, 55));

        assert.deepEqual(boxes, [{ references: ["R1"], nets: ["GND", "VCC"] }]);
        // The click that ends the drag selects nothing.
        assert.lengthOf(seen, 0);
        assert.notExists(m.viewer().layers.box_select.graphics);

        drag(m.viewer(), new Vec2(30, 40), new Vec2(170, 60));
        assert.deepEqual(boxes[1], {
            references: ["C1", "R1"],
            nets: ["GND", "VCC"],
        });

        drag(m.viewer(), new Vec2(60, 50), new Vec2(140, 60));
        assert.deepEqual(boxes[2], { references: [], nets: [] });
    });

    test("boxselect: off without the attribute, and without shift", async function () {
        const m = await mount_board();
        const boxes = box_events(m.embed);

        drag(m.viewer(), new Vec2(35, 45), new Vec2(45, 55));
        assert.lengthOf(boxes, 0);

        m.embed.setAttribute("boxselect", "");
        drag(m.viewer(), new Vec2(35, 45), new Vec2(45, 55), false);
        assert.lengthOf(boxes, 0);

        m.embed.removeAttribute("boxselect");
        drag(m.viewer(), new Vec2(35, 45), new Vec2(45, 55));
        assert.lengthOf(boxes, 0);
    });
});
