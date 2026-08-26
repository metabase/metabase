// Packages metabase-plugin.json + dist/ into <name>-<version>.tgz at the
// project root, ready to upload via Admin → Custom visualizations → Add.
//
// Layout (manifest at root, dist/index.js, dist/assets/*) matches what the
// Metabase backend expects.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

import { pack as tarPack } from "tar-stream";

import { version as SDK_VERSION } from "../package.json";

// Limits enforced by the Metabase backend on uploaded plugin bundles.
export const MAX_COMPRESSED_BYTES = 5 * 1024 * 1024;
export const MAX_UNCOMPRESSED_BYTES = 25 * 1024 * 1024;

export async function packPlugin(dir: string = process.cwd()) {
  const projectRoot = resolve(dir);
  const manifestPath = resolve(projectRoot, "metabase-plugin.json");

  if (!existsSync(manifestPath)) {
    throw new Error("metabase-plugin.json not found at the project root.");
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  const name = manifest.name?.trim();

  if (!name) {
    throw new Error('metabase-plugin.json is missing a "name" field.');
  }

  const bundlePath = resolve(projectRoot, "dist/index.js");

  if (!existsSync(bundlePath)) {
    throw new Error('dist/index.js not found. Run "npm run build" first.');
  }

  const pkg = JSON.parse(
    readFileSync(resolve(projectRoot, "package.json"), "utf-8"),
  );
  const version = pkg.version?.trim();

  if (!version) {
    throw new Error('package.json is missing a "version" field.');
  }

  const assetNames = Array.from(
    new Set([
      ...(manifest.icon ? [manifest.icon] : []),
      ...(manifest.assets ?? []),
    ]),
  );

  const tar = tarPack();
  const mtime = new Date();
  const addEntry = (path: string, content: Buffer) => {
    return tar.entry(
      { name: path, size: content.length, mtime, mode: 0o644 },
      content,
    );
  };

  const stampedManifest = {
    ...manifest,
    sdk: {
      ...manifest.sdk,
      version: SDK_VERSION,
    },
  };

  addEntry(
    "metabase-plugin.json",
    Buffer.from(JSON.stringify(stampedManifest, null, 2) + "\n"),
  );
  addEntry("dist/index.js", readFileSync(bundlePath));

  for (const assetName of assetNames) {
    const assetPath = resolve(projectRoot, "dist/assets", assetName);

    if (!existsSync(assetPath)) {
      throw new Error(
        `Asset "${assetName}" declared in metabase-plugin.json but missing from dist/assets/.`,
      );
    }

    addEntry(`dist/assets/${assetName}`, readFileSync(assetPath));
  }

  tar.finalize();

  const tarChunks = [];

  for await (const chunk of tar) {
    tarChunks.push(chunk);
  }

  const tarBuffer = Buffer.concat(tarChunks);
  const tgz = gzipSync(tarBuffer);

  if (tarBuffer.length > MAX_UNCOMPRESSED_BYTES) {
    throw new Error(
      `Uncompressed bundle is ${formatMiB(tarBuffer.length)}, exceeds limit of ${formatMiB(MAX_UNCOMPRESSED_BYTES)}.`,
    );
  }

  if (tgz.length > MAX_COMPRESSED_BYTES) {
    throw new Error(
      `Compressed bundle is ${formatMiB(tgz.length)}, exceeds limit of ${formatMiB(MAX_COMPRESSED_BYTES)}.`,
    );
  }

  const outPath = resolve(projectRoot, `${name}-${version}.tgz`);
  writeFileSync(outPath, tgz);

  return {
    outPath,
    compressedBytes: tgz.length,
    uncompressedBytes: tarBuffer.length,
  };
}

function formatMiB(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}
