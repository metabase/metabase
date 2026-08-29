/* eslint-disable import/no-commonjs */
// Measures the front-end bundles emitted into an extracted uberjar tree.
//
// Every bundle reports one or both of:
//  - "initial": JS the browser downloads on first paint (the entry chunk plus
//    its initial/sync split chunks). Never excludes initial chunks.
//  - "total":   all *reachable* JS (initial plus async chunks that are actually
//    loadable at runtime). Never includes unreachable/never-fetched chunks.
// Reachability needs the per-entry asset list from the rspack stats file, so the
// app and chunked SDK bundles require their stats file to be present.
//
// The pure pieces — the asset-name selection (initial vs reachable, runtime
// filtering, the async-loadable flag) — are split out as select*Assets so they
// can be unit-tested against a stats object. The measure* functions and main()
// keep all the filesystem and env I/O, threading an explicit `config`.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const APP_DIST = "resources/frontend_client/app/dist";
const SDK_ROOT = "resources/frontend_client/app/embedding-sdk";

// The chunk runtime is inlined into the bootstrap, never sent as a standalone file.
const SDK_RUNTIME_RE = /embedding-sdk-chunk-runtime\./;
const notRuntime = name => !SDK_RUNTIME_RE.test(name);

const assetFiles = (root, names) => names.map(name => path.join(root, name));
const unique = files => [...new Set(files)];

// MEASURE_ROOT lets callers point at an extracted tree (e.g. the PR bundle-size
// check measures a current and a base-ref tree); defaults to cwd for the stats
// workflow. MEASURE_BUNDLES restricts which bundles are measured (comma-separated).
// SDK_ASYNC_CHUNKS_LOADABLE (see selectChunkedSdkAssets) toggles whether async
// SDK chunks count toward "total".
function buildConfig(env) {
  const baseDir = env.MEASURE_ROOT ? path.resolve(env.MEASURE_ROOT) : process.cwd();
  const bundleFilter = env.MEASURE_BUNDLES
    ? new Set(env.MEASURE_BUNDLES.split(",").map(bundle => bundle.trim()))
    : null;
  return {
    resolve: (...relativeParts) => path.resolve(baseDir, ...relativeParts),
    isBundleWanted: bundle => !bundleFilter || bundleFilter.has(bundle),
    // Async SDK chunks are reachable once output.publicPath is set so import()
    // chunks are actually fetched at runtime — which landed in master. Defaults
    // to true to match master; set SDK_ASYNC_CHUNKS_LOADABLE=false to measure an
    // older commit built before the publicPath fix (async unreachable, so
    // "total" collapses to "initial").
    sdkAsyncChunksLoadable: env.SDK_ASYNC_CHUNKS_LOADABLE !== "false",
  };
}

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

function readStats(config, statsFile) {
  const statsPath = config.resolve(statsFile);
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

/**
 * Main app = the app-main entrypoint only (app/dist also holds other pages like
 * app-public, app-embed*, which are not the app). `reachableAssets` is null on
 * older stats built before the chunk-graph enrichment — the caller then falls
 * back to sizing the whole app/dist.
 */
function selectAppAssets(stats) {
  const initialAssets = entrypointJsAssets(stats, "app-main", "assets");
  if (!initialAssets) {
    throw new Error('app: stats-main.json / "app-main" entrypoint missing');
  }
  return { initialAssets, reachableAssets: entrypointJsAssets(stats, "app-main", "reachableAssets") };
}

/**
 * Legacy SDK: the "embedding-sdk" entry, a single eager file in legacy/. It still
 * emits on-demand chunks (jspdf, echarts, leaflet, ...) into the shared chunks/
 * dir via dynamic import(). initial = the eager legacy file; total = initial plus
 * its reachable async chunks, but only when those are loadable at runtime
 * (sdkAsyncChunksLoadable), otherwise total collapses to initial. Returns null
 * when the stats lack the entry (older layout) so the caller can fall back.
 */
function selectLegacySdkAssets(stats, { sdkAsyncChunksLoadable }) {
  const initialNames = entrypointJsAssets(stats, "embedding-sdk", "assets");
  if (!initialNames) {
    return null;
  }
  const reachableNames = entrypointJsAssets(stats, "embedding-sdk", "reachableAssets") || initialNames;
  const initial = unique(initialNames).filter(notRuntime);
  return {
    initialNames: initial,
    reachableNames: sdkAsyncChunksLoadable ? unique(reachableNames).filter(notRuntime) : initial,
  };
}

/**
 * Chunked SDK delivery. initial = bootstrap (minus its inlined runtime) + the
 * chunked entry's initial chunks. total = the chunked entry's reachable set
 * (initial + async children, from the chunk graph). includesAsyncChunks is true
 * only when the stats carry the reachable chunk graph AND those chunks are
 * loadable at runtime (sdkAsyncChunksLoadable). A base ref built before the
 * reachableAssets enrichment has no graph, so its "total" must collapse to
 * "initial" — the flag lets the comparison avoid measuring a reachable total
 * against a collapsed one (an apples-to-oranges ~30% phantom).
 */
function selectChunkedSdkAssets(stats, { sdkAsyncChunksLoadable }) {
  const chunkedInitial = entrypointJsAssets(stats, "embedding-sdk-chunked", "assets");
  if (!chunkedInitial) {
    throw new Error('embedding-sdk-chunked: stats-embedding-sdk.json / "embedding-sdk-chunked" entrypoint missing');
  }
  const bootstrapInitial = entrypointJsAssets(stats, "embedding-sdk-bootstrap", "assets") || [];
  const chunkedReachableAssets = entrypointJsAssets(stats, "embedding-sdk-chunked", "reachableAssets");
  const chunkedReachable = chunkedReachableAssets || chunkedInitial;
  const bootstrapReachable = entrypointJsAssets(stats, "embedding-sdk-bootstrap", "reachableAssets") || bootstrapInitial;
  return {
    initialNames: unique([...bootstrapInitial, ...chunkedInitial]).filter(notRuntime),
    reachableNames: unique([...bootstrapReachable, ...chunkedReachable]).filter(notRuntime),
    includesAsyncChunks: chunkedReachableAssets != null && sdkAsyncChunksLoadable,
  };
}

function measureApp(config) {
  const dist = config.resolve(APP_DIST);
  if (!fs.existsSync(dist)) {
    throw new Error(`Bundle output not found for "app": ${dist}`);
  }
  const { initialAssets, reachableAssets } = selectAppAssets(readStats(config, "artifacts/stats-main.json"));
  if (!reachableAssets) {
    console.warn("app: stats has no reachableAssets; app total falls back to the whole app/dist");
  }
  const totalFiles = reachableAssets ? assetFiles(dist, reachableAssets) : collectJsFiles(dist);
  return [
    { bundle: "app", kind: "initial", ...sizeOf(assetFiles(dist, initialAssets)) },
    { bundle: "app", kind: "total", ...sizeOf(totalFiles) },
  ];
}

function measureLegacySdk(config) {
  const absRoot = config.resolve(SDK_ROOT);
  const selected = selectLegacySdkAssets(readStats(config, "artifacts/stats-embedding-sdk.json"), config);
  if (!selected) {
    // No stats / older layout: fall back to whatever sits in the legacy dir.
    const candidates = [`${SDK_ROOT}/legacy`, `${SDK_ROOT}.js`];
    const chosen = candidates.find(candidate => fs.existsSync(config.resolve(candidate)));
    if (!chosen) {
      console.warn(`Skipping "embedding-sdk-legacy": output not found (${candidates.join(", ")})`);
      return [];
    }
    return [{ bundle: "embedding-sdk-legacy", kind: "total", ...sizeOf(collectJsFiles(config.resolve(chosen))) }];
  }
  return [
    { bundle: "embedding-sdk-legacy", kind: "initial", ...sizeOf(assetFiles(absRoot, selected.initialNames)) },
    { bundle: "embedding-sdk-legacy", kind: "total", ...sizeOf(assetFiles(absRoot, selected.reachableNames)) },
  ];
}

function measureChunkedSdk(config) {
  const chunksDir = config.resolve(SDK_ROOT, "chunks");
  if (!fs.existsSync(chunksDir)) {
    // pre-chunked layout (monolith only) — nothing to measure here
    return [];
  }
  const absRoot = config.resolve(SDK_ROOT);
  const { initialNames, reachableNames, includesAsyncChunks } = selectChunkedSdkAssets(
    readStats(config, "artifacts/stats-embedding-sdk.json"),
    config,
  );
  const initial = sizeOf(assetFiles(absRoot, initialNames));
  const total = includesAsyncChunks ? sizeOf(assetFiles(absRoot, reachableNames)) : initial;
  return [
    { bundle: "embedding-sdk-chunked", kind: "initial", ...initial },
    { bundle: "embedding-sdk-chunked", kind: "total", reachable: includesAsyncChunks, ...total },
  ];
}

// Single-file/dir bundles loaded in one shot — total only.
function measureWholeDir(config, bundle, candidates) {
  const chosen = candidates.find(candidate => fs.existsSync(config.resolve(candidate)));
  if (!chosen) {
    console.warn(`Skipping "${bundle}": output not found (${candidates.join(", ")})`);
    return [];
  }
  return [{ bundle, kind: "total", ...sizeOf(collectJsFiles(config.resolve(chosen))) }];
}

const bundles = {
  app: measureApp,
  "embedding-sdk-legacy": measureLegacySdk,
  "embedding-sdk-chunked": measureChunkedSdk,
  "embedding-sdk-package": config => measureWholeDir(config, "embedding-sdk-package", ["resources/embedding-sdk/dist"]),
  "embed-js": config => measureWholeDir(config, "embed-js", ["resources/frontend_client/app/embed.js"]),
};

function measureBundleSizes(config) {
  return Object.entries(bundles)
    .filter(([bundle]) => config.isBundleWanted(bundle))
    .flatMap(([, measure]) => measure(config));
}

module.exports = {
  measureBundleSizes,
  buildConfig,
  entrypointJsAssets,
  selectAppAssets,
  selectLegacySdkAssets,
  selectChunkedSdkAssets,
};

if (require.main === module) {
  console.log(JSON.stringify(measureBundleSizes(buildConfig(process.env)), null, 2));
}
