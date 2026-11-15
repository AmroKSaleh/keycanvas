/*
    Copyright (c) 2026 KeyLife.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

/**
 * Drawing for the marks a host application puts on the document: the dashed
 * outline of a pending part, its label, and the brief flash after a write.
 */

import { BBox, Vec2 } from "../../base/math";
import { Color, Polygon, Polyline, Renderer } from "../../graphics";
import { StrokeFont, TextAttributes } from "../../kicad/text";

/** KeyLife teal. */
export const mark_color = Color.from_css("#127C86");

/** How long a flash takes to fade out, in milliseconds. */
export const flash_duration = 1000;

function clamp(v: number, lo: number, hi: number) {
    return Math.min(hi, Math.max(lo, v));
}

/** The outline width for a part of this size, in world units (mm). */
function outline_width(bb: BBox) {
    return clamp(Math.max(bb.w, bb.h) * 0.03, 0.05, 0.3);
}

/** The box a mark is drawn around: the part's, with some room to breathe. */
export function mark_box(bb: BBox) {
    return bb.grow(Math.max(bb.w, bb.h) * 0.08 + outline_width(bb) * 2);
}

/** A dashed rectangle around a part's bounding box. */
export function paint_dashed_box(gfx: Renderer, part: BBox, color: Color) {
    const bb = mark_box(part);
    const width = outline_width(part);
    const dash = clamp(Math.max(part.w, part.h) * 0.08, 0.2, 1.5);
    const gap = dash * 0.6;

    const corners = [
        bb.top_left,
        bb.top_right,
        bb.bottom_right,
        bb.bottom_left,
        bb.top_left,
    ];

    for (let i = 0; i < 4; i++) {
        const a = corners[i]!;
        const b = corners[i + 1]!;
        const length = b.sub(a).magnitude;
        if (length <= 0) {
            continue;
        }
        const dir = b.sub(a).multiply(1 / length);
        for (let at = 0; at < length; at += dash + gap) {
            const end = Math.min(at + dash, length);
            gfx.line(
                new Polyline(
                    [a.add(dir.multiply(at)), a.add(dir.multiply(end))],
                    width,
                    color,
                ),
            );
        }
    }
}

/** A solid, lightly filled rectangle around a part's bounding box. */
export function paint_solid_box(gfx: Renderer, part: BBox, color: Color) {
    const bb = mark_box(part);
    gfx.polygon(Polygon.from_BBox(bb, color.with_alpha(0.2)));
    gfx.line(Polyline.from_BBox(bb, outline_width(part) * 1.5, color));
}

/** A small label just above the top left corner of a part's mark. */
export function paint_label(
    gfx: Renderer,
    text: string,
    part: BBox,
    color: Color,
) {
    const bb = mark_box(part);
    const height = clamp(Math.max(part.w, part.h) * 0.15, 0.5, 1.5);

    const attributes = new TextAttributes();
    attributes.color = color;
    attributes.h_align = "left";
    attributes.v_align = "bottom";
    attributes.size = new Vec2(height, height).multiply(10000);
    attributes.stroke_width = (height / 7) * 10000;
    attributes.mirrored = gfx.state.flipped;
    attributes.multiline = false;

    // Stroke fonts work in KiCad's internal units, 1/10000 mm.
    const position = new Vec2(bb.x, bb.y - height * 0.3).multiply(10000);
    StrokeFont.default().draw(gfx, text, position, attributes);
}
