import { defaultReporter, summaryReporter } from "@web/test-runner";
//import { chromeLauncher } from "@web/test-runner-chrome";
import { esbuildPlugin } from "@web/dev-server-esbuild";

// https://modern-web.dev/docs/test-runner/cli-and-configuration/

export default {
    // Custom-element tests run under web-test-runner.elements.config.mjs.
    files: ["test/**/*.test.ts", "!test/elements/**"],
    nodeResolve: true,
    debugger: true,
    // browsers: [
    //     chromeLauncher({
    //         concurrency: 1,
    //         launchOptions: {
    //             devtools: true,
    //         },
    //     }),
    // ],
    plugins: [
        esbuildPlugin({
            ts: true,
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
    reporters: [
        defaultReporter({ reportTestResults: true, reportTestProgress: true }),
        summaryReporter(),
    ],
    testFramework: {
        config: {
            ui: "tdd",
        },
    },
};
