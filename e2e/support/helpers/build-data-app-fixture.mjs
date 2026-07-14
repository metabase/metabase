import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { build as bundle } from "esbuild";
import { build } from "vite";

import {
  BUILD_CONFIGS_DIR,
  DATA_APP_FIXTURES_DIR,
  SDK_DATA_APP_DEV_CONFIG_SOURCE,
} from "./data-app-fixture-paths.mjs";

const appName = process.argv[2];
if (!appName) {
  console.error("usage: build-data-app-fixture.mjs <appName>");
  process.exit(2);
}

const appDir = path.join(DATA_APP_FIXTURES_DIR, appName);

if (!fs.existsSync(path.join(appDir, "src"))) {
  console.error(`data-app fixture "${appName}" has no src/ at ${appDir}`);
  process.exit(2);
}

const scratchDir = path.join(DATA_APP_FIXTURES_DIR, ".build");
fs.mkdirSync(scratchDir, { recursive: true });
const dataAppDevEntry = path.join(scratchDir, `${appName}.data-app-dev.mjs`);

await bundle({
  entryPoints: [SDK_DATA_APP_DEV_CONFIG_SOURCE],
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
  root: appDir,
  configFile: false,
  logLevel: "warn",
  plugins: dataAppConfig().plugins,
});
