# Building keycanvas

This document records the exact steps that produce a green build, lint, and test
run for this fork. It was verified on Windows 11 with Node.js 22 and npm 11.

## Prerequisites

- **Node.js** 18+ (verified on v22) and **npm** (verified on v11).
- A POSIX shell (**Git Bash** on Windows) for the `clean` script, which uses
  `rm -rf`. All other scripts are cross-platform and run from PowerShell or cmd.

## Install

```sh
npm ci
```

(Use `npm install` if you don't have a matching `package-lock.json`.)

## Build

```sh
npm run build
```

This runs two steps:

1. `tsc -p tsconfig.json` — type-checks the whole project (no emit).
2. `node scripts/build.js` — bundles the app with esbuild to
   `build/kicanvas.js` (minified) and writes `build/esbuild-meta.json`.

A successful run prints `Build complete!` with `0 warnings` / `0 errors`.

## Lint

```sh
npm run lint
```

This runs, in order:

1. `lint:eslint` — ESLint over `src/`.
2. `lint:types` — `tsc` type-check.
3. `lint:prettier` — `prettier . --check`.

### Windows line-endings gotcha

Prettier is configured for LF line endings, but Git on Windows checks files out
as CRLF when `core.autocrlf=true`, which makes `prettier --check` report every
file as unformatted. If you hit this, configure the repo to keep the working
tree as LF (matching what is stored in Git) before checking out:

```sh
git config core.autocrlf false
git config core.eol lf
# Re-materialize the working tree with LF endings:
git ls-files -z | xargs -0 rm -f
git checkout-index --force --all
git reset --hard HEAD   # clears the stat cache so `git status` is clean
```

After this, `npm run lint` passes cleanly.

## Test

```sh
npm test
```

Tests run in headless Chrome via `@web/test-runner`. All suites (including the
selection-event unit tests in `test/kicanvas/select-event.test.ts`) should pass.

To run only the selection-event tests:

```sh
npx web-test-runner --config scripts/web-test-runner.config.mjs \
    --files "test/kicanvas/select-event.test.ts"
```

> Note: on some Windows setups the runner occasionally prints a spurious
> "browser was unable to create and start a test page" message at the very end
> even though every test file passed. Re-running usually clears it; check the
> `N passed, 0 failed` summary line for the real result.

## Serve the debug page

```sh
npm run serve
```

This bundles a debug build to `debug/kicanvas/kicanvas.js` (with source maps),
watches for changes, and serves `./debug` at <http://localhost:8001>. Open
`http://localhost:8001/` (or `board.html` / `schematic.html`) to exercise the
viewer manually.

## Clean

```sh
npm run clean
```

Removes `build/` and `debug/kicanvas/`. Uses `rm -rf`, so run it from Git Bash
on Windows.
