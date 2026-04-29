/* global Buffer, console, process */
// Packages metabase-plugin.json + dist/ into <name>-<version>.tgz at the
// project root, ready to upload via Admin → Custom visualizations → Add.
//
// Layout (manifest at root, dist/index.js, dist/assets/*) matches what the
// Metabase backend expects.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";

import { pack as tarPack } from "tar-stream";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const manifestPath = resolve(projectRoot, "metabase-plugin.json");
if (!existsSync(manifestPath)) {
  console.error("metabase-plugin.json not found at the project root.");
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
const name = manifest.name?.trim();
if (!name) {
  console.error('metabase-plugin.json is missing a "name" field.');
  process.exit(1);
}

const bundlePath = resolve(projectRoot, "dist/index.js");
if (!existsSync(bundlePath)) {
  console.error('dist/index.js not found. Run "npm run build" first.');
  process.exit(1);
}

const pkg = JSON.parse(
  readFileSync(resolve(projectRoot, "package.json"), "utf-8"),
);
const version = pkg.version ?? "0.0.0";

const assetNames = Array.from(
  new Set([
    ...(manifest.icon ? [manifest.icon] : []),
    ...(manifest.assets ?? []),
  ]),
);

const tar = tarPack();
const mtime = new Date();
const addEntry = (path, content) =>
  tar.entry({ name: path, size: content.length, mtime, mode: 0o644 }, content);

addEntry("metabase-plugin.json", readFileSync(manifestPath));
addEntry("dist/index.js", readFileSync(bundlePath));
for (const assetName of assetNames) {
  const assetPath = resolve(projectRoot, "dist/assets", assetName);
  if (!existsSync(assetPath)) {
    console.error(
      `Asset "${assetName}" declared in metabase-plugin.json but missing from dist/assets/.`,
    );
    process.exit(1);
  }
  addEntry(`dist/assets/${assetName}`, readFileSync(assetPath));
}
tar.finalize();

const chunks = [];
for await (const chunk of tar.pipe(createGzip())) {
  chunks.push(chunk);
}
const tgz = Buffer.concat(chunks);

const outPath = resolve(projectRoot, `${name}-${version}.tgz`);
writeFileSync(outPath, tgz);
console.log(`Packed ${outPath} (${(tgz.length / 1024).toFixed(1)} KiB)`);
