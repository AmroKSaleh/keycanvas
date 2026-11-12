/*
    Tests that mount the custom elements (<kicanvas-embed> and its apps).

    They need the project's tsconfig: the elements use experimental decorators
    with `useDefineForClassFields: false`, as the production bundle does. The
    parser tests under the main config are written against the other class
    field semantics, so the two suites cannot share one esbuild setup.
*/

import { esbuildPlugin } from "@web/dev-server-esbuild";
import base from "./web-test-runner.config.mjs";

export default {
    ...base,
    files: "test/elements/**/*.test.ts",
    // One page at a time: the viewers wait on requestAnimationFrame, which a
    // browser throttles in pages it considers in the background.
    concurrency: 1,
    plugins: [
        esbuildPlugin({
            ts: true,
            tsconfig: "tsconfig.json",
            loaders: {
                ".js": "ts",
                ".glsl": "text",
                ".css": "text",
                ".svg": "text",
                ".kicad_pcb": "text",
                ".kicad_sch": "text",
                ".kicad_wks": "text",
                ".kicad_pro": "text",
            },
        }),
    ],
};
