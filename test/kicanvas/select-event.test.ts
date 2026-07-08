/*
    Copyright (c) 2024 KeyLife.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { assert } from "chai";
import { Footprint } from "../../src/kicad/board";
import { SchematicSymbol, SchematicSheet } from "../../src/kicad/schematic";
import { build_select_detail } from "../../src/kicanvas/elements/select-event";

/**
 * Builds a Footprint-shaped object without running the s-expression parser.
 * Only the fields read by build_select_detail are populated.
 */
function make_footprint(props: {
    reference?: string;
    value?: string;
    fields?: Record<string, string>;
    sheetname?: string;
}): Footprint {
    const fp = Object.create(Footprint.prototype) as Footprint;
    fp.reference = props.reference as string;
    fp.value = props.value as string;
    fp.sheetname = props.sheetname;
    fp.properties = {};
    for (const [name, value] of Object.entries(props.fields ?? {})) {
        (fp.properties as Record<string, { value: string }>)[name] = { value };
    }
    return fp;
}

/**
 * Builds a SchematicSymbol-shaped object. Its reference/value are getters
 * backed by the properties map, so the map drives everything.
 */
function make_symbol(fields: Record<string, string>): SchematicSymbol {
    const sym = Object.create(SchematicSymbol.prototype) as SchematicSymbol;
    const props = new Map<string, { name: string; text: string }>();
    for (const [name, text] of Object.entries(fields)) {
        props.set(name, { name, text });
    }
    (sym as unknown as { properties: unknown }).properties = props;
    return sym;
}

suite("kicanvas.select-event", function () {
    test("maps a board footprint to a footprint payload", function () {
        const fp = make_footprint({
            reference: "R1",
            value: "10k",
            fields: { MPN: "RC0402-10K", Manufacturer: "Yageo" },
            sheetname: "Power",
        });

        const detail = build_select_detail(fp);

        assert.isNotNull(detail);
        assert.equal(detail!.itemType, "footprint");
        assert.equal(detail!.reference, "R1");
        assert.equal(detail!.value, "10k");
        assert.deepEqual(detail!.fields, {
            MPN: "RC0402-10K",
            Manufacturer: "Yageo",
        });
        assert.equal(detail!.sheet, "Power");
    });

    test("maps a schematic symbol to a symbol payload", function () {
        const sym = make_symbol({
            Reference: "U1",
            Value: "ATmega328",
            MPN: "ATMEGA328-AU",
        });

        const detail = build_select_detail(sym, { sheet: "root.kicad_sch" });

        assert.isNotNull(detail);
        assert.equal(detail!.itemType, "symbol");
        assert.equal(detail!.reference, "U1");
        assert.equal(detail!.value, "ATmega328");
        assert.equal(detail!.fields["MPN"], "ATMEGA328-AU");
        assert.equal(detail!.sheet, "root.kicad_sch");
    });

    test("normalizes missing reference/value to null", function () {
        const fp = make_footprint({ fields: {} });

        const detail = build_select_detail(fp);

        assert.isNotNull(detail);
        assert.isNull(detail!.reference);
        assert.isNull(detail!.value);
        assert.deepEqual(detail!.fields, {});
        assert.notProperty(detail, "sheet");
    });

    test("returns null for a schematic sheet (not a footprint/symbol)", function () {
        const sheet = Object.create(SchematicSheet.prototype) as SchematicSheet;

        assert.isNull(build_select_detail(sheet));
    });

    test("returns null for null / unknown items", function () {
        assert.isNull(build_select_detail(null));
        assert.isNull(build_select_detail(undefined));
        assert.isNull(build_select_detail({ reference: "R1" }));
    });
});
