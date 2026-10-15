import { esbuildPlugin } from "@web/dev-server-esbuild";
import base from "./web-test-runner.config.mjs";

// Tests that mount kicanvas custom elements. These need the build's class
// semantics from tsconfig.json (experimentalDecorators,
// useDefineForClassFields: false) so the @attribute/@query decorators work;
// the parser tests in the base config rely on esbuild's defaults instead.

export default {
    ...base,
    files: "test/elements/**/*.test.ts",
    // One page at a time: a background tab gets no animation frames, which
    // the viewers wait on.
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
                ".kicad_wks": "text",
                ".kicad_sch": "text",
            },
        }),
    ],
};
