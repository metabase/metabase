import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { build as bundle } from "esbuild";
import { build } from "vite";

import {
  BUILD_CONFIGS_DIR,
  DATA_APP_FIXTURES_DIR,
  DATA_APP_TEMPLATE_DIR,
  SDK_DATA_APP_DEV_SOURCE,
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

// Load `dataAppConfig` by transpiling it from SDK source into the throwaway
// build dir — regular e2e doesn't build the SDK's `dist/`, so there's no
// prebuilt entry to import. node_modules deps stay external; the `build-configs`
// path alias is mapped to frontend/build so the dev-config graph resolves.
const dataAppDevEntry = path.join(buildDir, ".data-app-dev.mjs");

await bundle({
  entryPoints: [SDK_DATA_APP_DEV_SOURCE],
  outfile: dataAppDevEntry,
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  alias: { "build-configs": BUILD_CONFIGS_DIR },
  logLevel: "warning",
});

const { dataAppConfig } = await import(pathToFileURL(dataAppDevEntry).href);

await build({
  root: buildDir,
  configFile: false,
  logLevel: "warn",
  plugins: dataAppConfig().plugins,
});
