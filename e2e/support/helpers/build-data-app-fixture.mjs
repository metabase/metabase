import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "vite";

import {
  DATA_APP_FIXTURES_DIR,
  DATA_APP_TEMPLATE_DIR,
  SDK_DATA_APP_DEV_ENTRY,
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

const { dataAppConfig } = await import(
  pathToFileURL(SDK_DATA_APP_DEV_ENTRY).href
);

await build({
  root: buildDir,
  configFile: false,
  logLevel: "warn",
  plugins: dataAppConfig().plugins,
});
