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
 * Async SDK chunks are unreachable today: output.publicPath is "", so import()
 * chunks are emitted but never fetched at runtime. They're excluded from "total"
 * (which equals "initial") until that's fixed. There's no reliable way to detect
 * loadability from the build artifacts, so this is a manual flag: flip it to true
 * in the same change that lands the publicPath fix, and "total" will include the
 * (now reachable) async chunks while "initial" stays the eager first-load set.
 */
const SDK_ASYNC_CHUNKS_LOADABLE = false;

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

// The .js assets that make up an entrypoint's initial (synchronous) load.
function entrypointJsAssets(stats, name) {
  const entry = stats && stats.entrypoints && stats.entrypoints[name];
  if (!entry) {
    return null;
  }
  return entry.assets.map(asset => asset.name || asset).filter(assetName => assetName.endsWith(".js"));
}

const assetFiles = (root, names) => names.map(name => path.join(root, name));
const unique = files => [...new Set(files)];

/**
 * Main app. initial = the app-main entrypoint's initial assets; total = every
 * .js in app/dist. The app has a single entrypoint with a working publicPath, so
 * rspack only emits chunks reachable from it — dist == the reachable set.
 */
function measureApp() {
  const dist = resolve(APP_DIST);
  if (!fs.existsSync(dist)) {
    throw new Error(`Bundle output not found for "app": ${dist}`);
  }
  const initialAssets = entrypointJsAssets(readStats("artifacts/stats-main.json"), "app-main");
  if (!initialAssets) {
    throw new Error('app: stats-main.json / "app-main" entrypoint missing; cannot measure initial');
  }
  return [
    { bundle: "app", kind: "initial", ...sizeOf(assetFiles(dist, initialAssets)) },
    { bundle: "app", kind: "total", ...sizeOf(collectJsFiles(dist)) },
  ];
}

/**
 * Legacy SDK: a self-contained monolith loaded in one shot, so initial == total.
 * Reported as total only.
 */
function measureLegacySdk() {
  const candidates = [`${SDK_ROOT}/legacy`, `${SDK_ROOT}.js`];
  const chosen = candidates.find(candidate => fs.existsSync(resolve(candidate)));
  if (!chosen) {
    console.warn(`Skipping "embedding-sdk-legacy": output not found (${candidates.join(", ")})`);
    return [];
  }
  return [{ bundle: "embedding-sdk-legacy", kind: "total", ...sizeOf(collectJsFiles(resolve(chosen))) }];
}

/**
 * Chunked SDK delivery. initial = bootstrap (minus its inlined runtime) + the
 * chunked entry's initial chunks. total = initial plus async chunks, but only
 * when they're actually loadable (see SDK_ASYNC_CHUNKS_LOADABLE); every emitted
 * SDK chunk is graph-reachable, so when loadable total == all chunks.
 */
function measureChunkedSdk() {
  const chunksDir = resolve(SDK_ROOT, "chunks");
  if (!fs.existsSync(chunksDir)) {
    // pre-chunked layout (monolith only) — nothing to measure here
    return [];
  }
  const absRoot = resolve(SDK_ROOT);
  const stats = readStats("artifacts/stats-embedding-sdk.json");
  const chunked = entrypointJsAssets(stats, "embedding-sdk-chunked");
  if (!chunked) {
    throw new Error(
      'embedding-sdk-chunked: stats-embedding-sdk.json / "embedding-sdk-chunked" entrypoint missing; ' +
        "cannot measure initial without counting unreachable async chunks",
    );
  }
  const bootstrap = entrypointJsAssets(stats, "embedding-sdk-bootstrap") || [];
  const initialNames = unique([...bootstrap, ...chunked]).filter(name => !SDK_RUNTIME_RE.test(name));
  const initialFiles = assetFiles(absRoot, initialNames);

  const allChunkFiles = collectJsFiles(chunksDir).filter(file => !SDK_RUNTIME_RE.test(file));
  const reachableTotalFiles = unique([...initialFiles, ...allChunkFiles]);

  const initial = sizeOf(initialFiles);
  const total = SDK_ASYNC_CHUNKS_LOADABLE ? sizeOf(reachableTotalFiles) : initial;
  return [
    { bundle: "embedding-sdk-chunked", kind: "initial", ...initial },
    { bundle: "embedding-sdk-chunked", kind: "total", ...total },
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
