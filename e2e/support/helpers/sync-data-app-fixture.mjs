import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { build as bundle } from "esbuild";

import { DATA_APP_FIXTURES_DIR, REPO_ROOT } from "./data-app-fixture-paths.mjs";

const appRoot = process.argv[2];
if (!appRoot) {
  console.error("usage: sync-data-app-fixture.mjs <appRoot>");
  process.exit(2);
}

const { DATA_APP_MB_URL, DATA_APP_MB_API_KEY } = process.env;
if (!DATA_APP_MB_URL || !DATA_APP_MB_API_KEY) {
  console.error("DATA_APP_MB_URL and DATA_APP_MB_API_KEY must be set");
  process.exit(2);
}

const SDK_PACKAGE_DIR = path.join(
  REPO_ROOT,
  "enterprise/frontend/src/embedding-sdk-package",
);

const scratchDir = path.join(DATA_APP_FIXTURES_DIR, ".build");
fs.mkdirSync(scratchDir, { recursive: true });
const entry = path.join(scratchDir, "sync-resources.mjs");

// The synchronization sources are TypeScript and reach the SDK package by its
// build alias, so bundle them the way the fixture build does before importing.
await bundle({
  entryPoints: [path.join(SDK_PACKAGE_DIR, "data-app-query-sync/sync.ts")],
  outfile: entry,
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  alias: { "embedding-sdk-package": SDK_PACKAGE_DIR },
  logLevel: "warning",
});

const { syncResources } = await import(pathToFileURL(entry).href);

await syncResources({
  appRoot,
  metabaseUrl: DATA_APP_MB_URL,
  apiKey: DATA_APP_MB_API_KEY,
  log: (message) => console.log(`[sync-resources] ${message}`),
});
