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

const slug = process.argv[2];
if (!slug) {
  console.error("usage: build-data-app-fixture.mjs <slug>");
  process.exit(2);
}

const appDir = path.join(DATA_APP_FIXTURES_DIR, "data_apps", slug);

if (!fs.existsSync(path.join(appDir, "src"))) {
  console.error(`data-app fixture "${slug}" has no src/ at ${appDir}`);
  process.exit(2);
}

const scratchDir = path.join(DATA_APP_FIXTURES_DIR, ".build");
fs.mkdirSync(scratchDir, { recursive: true });
const dataAppDevEntry = path.join(scratchDir, `${slug}.data-app-dev.mjs`);

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

process.chdir(appDir);

const buildInfoDefine = Object.fromEntries(
  [
    "VERSION",
    "GIT_BRANCH",
    "GIT_COMMIT_SHA",
    "BUILD_TIME",
    "EMBEDDING_SDK_BUNDLE_HOST",
  ].map((key) => [`process.env.${key}`, '""']),
);

await build({
  root: appDir,
  configFile: false,
  logLevel: "warn",
  define: {
    ...buildInfoDefine,
    "process.env.IS_EMBEDDING_SDK": '"true"',
  },
  plugins: dataAppConfig().plugins,
});
