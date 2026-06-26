/* eslint-disable import/no-commonjs */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// MEASURE_ROOT lets callers point at an extracted tree (e.g. the PR bundle-size
// check measures a current and a base-ref tree); defaults to cwd for the stats
// workflow. MEASURE_BUNDLES restricts which bundles are measured (comma-separated).
//
// Every bundle reports one or both of:
//  - "initial": JS the browser downloads on first paint (the entry chunk plus
//    its initial/sync split chunks). Never excludes initial chunks.
//  - "total":   all *reachable* JS (initial plus async chunks that are actually
//    loadable at runtime). Never includes unreachable/never-fetched chunks.
// Reachability needs the per-entry asset list from the rspack stats file, so the
// app and chunked SDK bundles require their stats file to be present.
const baseDir = process.env.MEASURE_ROOT ? path.resolve(process.env.MEASURE_ROOT) : process.cwd();
const resolve = (...relativeParts) => path.resolve(baseDir, ...relativeParts);
const bundleFilter = process.env.MEASURE_BUNDLES
  ? new Set(process.env.MEASURE_BUNDLES.split(",").map(bundle => bundle.trim()))
  : null;
const isBundleWanted = bundle => !bundleFilter || bundleFilter.has(bundle);

const APP_DIST = "resources/frontend_client/app/dist";
const SDK_ROOT = "resources/frontend_client/app/embedding-sdk";

/**
 * Async SDK chunks are reachable once output.publicPath is set so import() chunks
 * are actually fetched at runtime — which landed in master. "total" then includes
 * them while "initial" stays the eager first-load set. There's no reliable way to
 * detect loadability from the build artifacts, so this is a manual flag, now
 * defaulting to true to match master. Set SDK_ASYNC_CHUNKS_LOADABLE=false to
 * measure an older commit built before the publicPath fix (async unreachable, so
 * "total" collapses to "initial").
 */
const SDK_ASYNC_CHUNKS_LOADABLE = process.env.SDK_ASYNC_CHUNKS_LOADABLE !== "false";

// The chunk runtime is inlined into the bootstrap, never sent as a standalone file.
const SDK_RUNTIME_RE = /embedding-sdk-chunk-runtime\./;

function sizeOf(files) {
  let rawBytes = 0;
  let gzipBytes = 0;
  let brotliBytes = 0;
  for (const file of files) {
    const contents = fs.readFileSync(file);
    rawBytes += contents.length;
    // gzip: recompressed, a proxy for the on-the-fly gzip served on every version
    gzipBytes += zlib.gzipSync(contents).length;
    // brotli: as-served — count the precompressed .br the build ships; files
    // without one (static-viz, sub-threshold chunks) are served compressed on
    // the fly, so estimate with brotli. Always reported (like gzip).
    const brotliPath = `${file}.br`;
    brotliBytes += fs.existsSync(brotliPath)
      ? fs.statSync(brotliPath).size
      : zlib.brotliCompressSync(contents).length;
  }
  return {
    fileCount: files.length,
    rawBytes,
    gzipBytes,
    brotliBytes,
  };
}

function collectJsFiles(absolutePath) {
  if (fs.statSync(absolutePath).isFile()) {
    return [absolutePath];
  }
  return fs
    .readdirSync(absolutePath, { withFileTypes: true })
    .flatMap(entry => {
      const childPath = path.join(absolutePath, entry.name);
      if (entry.isDirectory()) {
        return collectJsFiles(childPath);
      }
      return entry.name.endsWith(".js") ? [childPath] : [];
    });
}

function readStats(statsFile) {
  const statsPath = resolve(statsFile);
  return fs.existsSync(statsPath) ? JSON.parse(fs.readFileSync(statsPath, "utf8")) : null;
}

// An entrypoint's .js assets for a given field: "assets" = its initial
// (synchronous) load; "reachableAssets" = initial plus everything it can lazily
// import (the chunk graph walked at build time in bundle-stats.js).
function entrypointJsAssets(stats, name, field = "assets") {
  const entry = stats && stats.entrypoints && stats.entrypoints[name];
  if (!entry || !entry[field]) {
    return null;
  }
  return entry[field].map(asset => asset.name || asset).filter(assetName => assetName.endsWith(".js"));
}

const assetFiles = (root, names) => names.map(name => path.join(root, name));
const unique = files => [...new Set(files)];

/**
 * Main app = the app-main entrypoint only (app/dist also holds other pages like
 * app-public, app-embed*, which are not the app). initial = app-main's initial
 * load; total = everything app-main can reach (initial + its lazy routes),
 * scoped via the entrypoint's reachable set so sibling entrypoints' code is left
 * out.
 */
function measureApp() {
  const dist = resolve(APP_DIST);
  if (!fs.existsSync(dist)) {
    throw new Error(`Bundle output not found for "app": ${dist}`);
  }
  const stats = readStats("artifacts/stats-main.json");
  const initialAssets = entrypointJsAssets(stats, "app-main", "assets");
  if (!initialAssets) {
    throw new Error('app: stats-main.json / "app-main" entrypoint missing');
  }
  const reachableAssets = entrypointJsAssets(stats, "app-main", "reachableAssets");
  if (!reachableAssets) {
    // Older stats (built before the chunk-graph enrichment) have no
    // reachableAssets; fall back to the whole app/dist so a comparison against
    // such a base ref still runs while it catches up.
    console.warn("app: stats has no reachableAssets; app total falls back to the whole app/dist");
  }
  const totalFiles = reachableAssets ? assetFiles(dist, reachableAssets) : collectJsFiles(dist);
  return [
    { bundle: "app", kind: "initial", ...sizeOf(assetFiles(dist, initialAssets)) },
    { bundle: "app", kind: "total", ...sizeOf(totalFiles) },
  ];
}

/**
 * Legacy SDK: the "embedding-sdk" entry, a single eager file in legacy/. It still
 * emits on-demand chunks (jspdf, echarts, leaflet, ...) into the shared chunks/
 * dir via dynamic import(). initial = the eager legacy file; total = initial plus
 * its reachable async chunks — but only when those are loadable at runtime (see
 * SDK_ASYNC_CHUNKS_LOADABLE), otherwise total == initial. Mirrors the chunked SDK.
 */
function measureLegacySdk() {
  const absRoot = resolve(SDK_ROOT);
  const stats = readStats("artifacts/stats-embedding-sdk.json");
  const initialNames = entrypointJsAssets(stats, "embedding-sdk", "assets");
  if (!initialNames) {
    // No stats / older layout: fall back to whatever sits in the legacy dir.
    const candidates = [`${SDK_ROOT}/legacy`, `${SDK_ROOT}.js`];
    const chosen = candidates.find(candidate => fs.existsSync(resolve(candidate)));
    if (!chosen) {
      console.warn(`Skipping "embedding-sdk-legacy": output not found (${candidates.join(", ")})`);
      return [];
    }
    return [{ bundle: "embedding-sdk-legacy", kind: "total", ...sizeOf(collectJsFiles(resolve(chosen))) }];
  }
  const reachableNames = entrypointJsAssets(stats, "embedding-sdk", "reachableAssets") || initialNames;
  const notRuntime = name => !SDK_RUNTIME_RE.test(name);
  const initial = sizeOf(assetFiles(absRoot, unique(initialNames).filter(notRuntime)));
  const total = SDK_ASYNC_CHUNKS_LOADABLE ? sizeOf(assetFiles(absRoot, unique(reachableNames).filter(notRuntime))) : initial;
  return [
    { bundle: "embedding-sdk-legacy", kind: "initial", ...initial },
    { bundle: "embedding-sdk-legacy", kind: "total", ...total },
  ];
}

/**
 * Chunked SDK delivery. initial = bootstrap (minus its inlined runtime) + the
 * chunked entry's initial chunks. total = the chunked entry's reachable set
 * (initial + async children, from the chunk graph) — but only when those async
 * chunks are actually loadable at runtime (see SDK_ASYNC_CHUNKS_LOADABLE);
 * otherwise total == initial. Never counts chunks owned by a sibling entry.
 */
function measureChunkedSdk() {
  const chunksDir = resolve(SDK_ROOT, "chunks");
  if (!fs.existsSync(chunksDir)) {
    // pre-chunked layout (monolith only) — nothing to measure here
    return [];
  }
  const absRoot = resolve(SDK_ROOT);
  const stats = readStats("artifacts/stats-embedding-sdk.json");
  const chunkedInitial = entrypointJsAssets(stats, "embedding-sdk-chunked", "assets");
  if (!chunkedInitial) {
    throw new Error(
      'embedding-sdk-chunked: stats-embedding-sdk.json / "embedding-sdk-chunked" entrypoint missing',
    );
  }
  const bootstrapInitial = entrypointJsAssets(stats, "embedding-sdk-bootstrap", "assets") || [];
  const chunkedReachableAssets = entrypointJsAssets(stats, "embedding-sdk-chunked", "reachableAssets");
  const chunkedReachable = chunkedReachableAssets || chunkedInitial;
  const bootstrapReachable = entrypointJsAssets(stats, "embedding-sdk-bootstrap", "reachableAssets") || bootstrapInitial;

  const notRuntime = name => !SDK_RUNTIME_RE.test(name);
  const initialNames = unique([...bootstrapInitial, ...chunkedInitial]).filter(notRuntime);
  const reachableNames = unique([...bootstrapReachable, ...chunkedReachable]).filter(notRuntime);

  // "total" includes the async chunks only when the stats carry the reachable
  // chunk graph (reachableAssets) AND those chunks are loadable at runtime.
  // A base ref built before the reachableAssets enrichment has no graph, so its
  // "total" collapses to "initial". Flag this so the comparison never measures a
  // reachable total against a collapsed one (an apples-to-oranges ~30% phantom).
  const includesAsyncChunks = chunkedReachableAssets != null && SDK_ASYNC_CHUNKS_LOADABLE;

  const initial = sizeOf(assetFiles(absRoot, initialNames));
  const total = includesAsyncChunks ? sizeOf(assetFiles(absRoot, reachableNames)) : initial;
  return [
    { bundle: "embedding-sdk-chunked", kind: "initial", ...initial },
    { bundle: "embedding-sdk-chunked", kind: "total", reachable: includesAsyncChunks, ...total },
  ];
}

// Single-file/dir bundles loaded in one shot — total only.
function measureWholeDir(bundle, candidates) {
  const chosen = candidates.find(candidate => fs.existsSync(resolve(candidate)));
  if (!chosen) {
    console.warn(`Skipping "${bundle}": output not found (${candidates.join(", ")})`);
    return [];
  }
  return [{ bundle, kind: "total", ...sizeOf(collectJsFiles(resolve(chosen))) }];
}

const bundles = {
  app: measureApp,
  "embedding-sdk-legacy": measureLegacySdk,
  "embedding-sdk-chunked": measureChunkedSdk,
  "embedding-sdk-package": () => measureWholeDir("embedding-sdk-package", ["resources/embedding-sdk/dist"]),
  "embed-js": () => measureWholeDir("embed-js", ["resources/frontend_client/app/embed.js"]),
};

function measureBundleSizes() {
  return Object.entries(bundles)
    .filter(([bundle]) => isBundleWanted(bundle))
    .flatMap(([, measure]) => measure());
}

module.exports = { measureBundleSizes };

if (require.main === module) {
  console.log(JSON.stringify(measureBundleSizes(), null, 2));
}
