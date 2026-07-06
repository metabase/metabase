// Standalone builder for a data-app E2E fixture, run in its own Node process by
// the `buildDataApp` Cypress task. It must NOT be imported into the Cypress
// config process: Vite is ESM-only and importing it there breaks (the same
// reason the custom-viz task shells out). Usage:
//
//   node e2e/support/helpers/build-data-app-fixture.mjs <appName>
//
// The committed fixture holds only `<appName>/src/`. This scaffolds the
// `create-data-app` template base + that src into a throwaway `.build/<appName>/`
// dir (kept OUT of the committed fixture dir so no stray tsconfig/package.json
// shadows `e2e/tsconfig.json` in the IDE), then runs the production data-app
// build (via the locally built SDK's `dataAppConfig`), writing
// `.build/<appName>/dist/index.js`.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "vite";

import {
  DATA_APP_FIXTURES_DIR,
  DATA_APP_TEMPLATE_DIR,
} from "./data-app-fixture-paths.mjs";

const appName = process.argv[2];
if (!appName) {
  console.error("usage: build-data-app-fixture.mjs <appName>");
  process.exit(2);
}

const srcDir = path.join(DATA_APP_FIXTURES_DIR, appName, "src");
if (!fs.existsSync(srcDir)) {
  console.error(`data-app fixture "${appName}" has no src/ at ${srcDir}`);
  process.exit(2);
}

// Assemble the buildable project in a throwaway dir, never in the committed
// fixture dir: template base (minus its own src/ and dist/) + the fixture's src.
const buildDir = path.join(DATA_APP_FIXTURES_DIR, ".build", appName);
fs.rmSync(buildDir, { recursive: true, force: true });
fs.mkdirSync(buildDir, { recursive: true });
fs.cpSync(DATA_APP_TEMPLATE_DIR, buildDir, {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(DATA_APP_TEMPLATE_DIR, src);
    const isUnder = (dir) => rel === dir || rel.startsWith(`${dir}${path.sep}`);
    return !isUnder("src") && !isUnder("dist");
  },
});
fs.cpSync(srcDir, path.join(buildDir, "src"), { recursive: true });

const { dataAppConfig } = await import(
  pathToFileURL(SDK_DATA_APP_DEV_ENTRY).href
);

// `dataAppConfig`'s contract config hook sets `build.outDir: "dist"` and
// `lib.fileName: () => "index.js"`, so this writes `<buildDir>/dist/index.js`.
await build({
  root: buildDir,
  configFile: false,
  logLevel: "warn",
  plugins: dataAppConfig().plugins,
});
