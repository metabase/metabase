/* eslint-disable import/no-commonjs */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// MEASURE_ROOT lets callers point at an extracted tree (e.g. the PR bundle-size
// check measures a current and a base-ref tree); defaults to cwd for the stats
// workflow. MEASURE_BUNDLES restricts which bundles are measured (comma-separated).
const baseDir = process.env.MEASURE_ROOT ? path.resolve(process.env.MEASURE_ROOT) : process.cwd();
const resolve = (...relativeParts) => path.resolve(baseDir, ...relativeParts);
const bundleFilter = process.env.MEASURE_BUNDLES
  ? new Set(process.env.MEASURE_BUNDLES.split(",").map(bundle => bundle.trim()))
  : null;
const isBundleWanted = bundle => !bundleFilter || bundleFilter.has(bundle);

const SDK_ROOT = "resources/frontend_client/app/embedding-sdk";

/**
 * Async SDK chunks are reachable now that the runtime publicPath is set, so the
 * bootstrap can fetch import() chunks on demand. "total" therefore includes the
 * lazy chunks while "initial" stays the eager first-load set. There's no reliable
 * way to detect loadability from the build artifacts, so this stays a manual flag:
 * it was flipped to true alongside the publicPath fix.
 */
const SDK_ASYNC_CHUNKS_LOADABLE = true;

// The chunk runtime is inlined into the bootstrap, never sent as a standalone file.
const SDK_RUNTIME_RE = /embedding-sdk-chunk-runtime\./;

/**
 * Simple targets measured straight from emitted files.
 * - `dir`/`file`/`altFile`: what to measure (altFile is a fallback single file).
 * - `stats`: entrypoint whose initial assets are the "initial" download.
 * - `optional`: skip (don't fail) when the output is absent.
 * The hosted SDK is split into embedding-sdk-legacy (the self-contained
 * monolith) and embedding-sdk-chunked (handled separately below).
 */
const simpleTargets = [
  {
    bundle: "app",
    dir: "resources/frontend_client/app/dist",
    stats: { file: "artifacts/stats-main.json", entrypoint: "app-main" },
  },
  {
    bundle: "embedding-sdk-legacy",
    dir: `${SDK_ROOT}/legacy`,
    altFile: `${SDK_ROOT}.js`,
    optional: true,
  },
  {
    bundle: "embedding-sdk-package",
    dir: "resources/embedding-sdk/dist",
    optional: true,
  },
  {
    bundle: "embed-js",
    file: "resources/frontend_client/app/embed.js",
  },
];

function sizeOf(files) {
  let rawBytes = 0;
  let gzipBytes = 0;
  let brotliBytes = 0;
  let anyBrotli = false;
  for (const file of files) {
    const contents = fs.readFileSync(file);
    rawBytes += contents.length;
    // gzip: recompressed, a proxy for the on-the-fly gzip served on every version
    gzipBytes += zlib.gzipSync(contents).length;
    // brotli: as-served — count the precompressed .br the build ships; files
    // without one (static-viz, sub-threshold chunks) are served compressed on
    // the fly, so estimate with brotli. Null when no .br shipped at all.
    const brotliPath = `${file}.br`;
    if (fs.existsSync(brotliPath)) {
      anyBrotli = true;
      brotliBytes += fs.statSync(brotliPath).size;
    } else {
      brotliBytes += zlib.brotliCompressSync(contents).length;
    }
  }
  return {
    fileCount: files.length,
    rawBytes,
    gzipBytes,
    brotliBytes: anyBrotli ? brotliBytes : null,
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

function entrypointJsAssets(stats, name) {
  const entry = stats && stats.entrypoints && stats.entrypoints[name];
  if (!entry) {
    return null;
  }
  return entry.assets.map(asset => asset.name || asset).filter(name => name.endsWith(".js"));
}

function initialJsFiles({ file: statsFile, entrypoint, root }, joinRoot) {
  const stats = readStats(statsFile);
  if (!stats) {
    console.warn(`Stats file missing (${statsFile}); reporting initial == total.`);
    return null;
  }
  const assets = entrypointJsAssets(stats, entrypoint);
  if (!assets) {
    console.warn(`Entrypoint "${entrypoint}" missing in ${statsFile}; reporting initial == total.`);
    return null;
  }
  const base = root ? resolve(root) : joinRoot;
  return assets.map(name => path.join(base, name));
}

function measureSimpleTarget({ bundle, dir, file, altFile, stats, optional }) {
  const candidates = [dir, file, altFile].filter(Boolean);
  const chosen = candidates.find(c => fs.existsSync(resolve(c)));
  if (!chosen) {
    if (optional) {
      console.warn(`Skipping "${bundle}": output not found (${candidates.join(", ")})`);
      return [];
    }
    throw new Error(`Bundle output not found for "${bundle}": ${candidates.join(", ")}`);
  }

  const root = resolve(chosen);
  const total = sizeOf(collectJsFiles(root));
  const initialFiles = stats ? initialJsFiles(stats, root) : null;
  const initial = initialFiles ? sizeOf(initialFiles) : total;

  return [
    { bundle, kind: "initial", ...initial },
    { bundle, kind: "total", ...total },
  ];
}

/**
 * Chunked SDK delivery. "Reachable" = what the bootstrap actually sends: the
 * bootstrap (with its inlined runtime) + the chunked entry's initial chunks,
 * minus the standalone runtime file. Async chunks are excluded (initial == total)
 * unless SDK_ASYNC_CHUNKS_LOADABLE is set, at which point "total" includes them.
 */
function measureChunkedSdk(statsFile) {
  const chunksDir = resolve(SDK_ROOT, "chunks");
  if (!fs.existsSync(chunksDir)) {
    // pre-chunked layout (monolith only) — nothing to measure here
    return [];
  }

  const absRoot = resolve(SDK_ROOT);
  const everything = collectJsFiles(chunksDir).filter(f => !SDK_RUNTIME_RE.test(f));

  const stats = readStats(statsFile);
  const chunked = entrypointJsAssets(stats, "embedding-sdk-chunked");
  let reachableFiles;
  if (chunked) {
    const bootstrap = entrypointJsAssets(stats, "embedding-sdk-bootstrap") || [];
    const names = [...new Set([...bootstrap, ...chunked])].filter(n => !SDK_RUNTIME_RE.test(n));
    reachableFiles = names.map(n => path.join(absRoot, n));
  } else {
    console.warn(`embedding-sdk-chunked: entrypoint missing in ${statsFile}; counting whole chunks/ dir`);
    reachableFiles = everything;
  }

  const initial = sizeOf(reachableFiles);
  const total = SDK_ASYNC_CHUNKS_LOADABLE ? sizeOf(everything) : sizeOf(reachableFiles);

  return [
    { bundle: "embedding-sdk-chunked", kind: "initial", ...initial },
    { bundle: "embedding-sdk-chunked", kind: "total", ...total },
  ];
}

function measureBundleSizes() {
  return [
    ...simpleTargets.filter(target => isBundleWanted(target.bundle)).flatMap(measureSimpleTarget),
    ...(isBundleWanted("embedding-sdk-chunked")
      ? measureChunkedSdk("artifacts/stats-embedding-sdk.json")
      : []),
  ];
}

module.exports = { measureBundleSizes };

if (require.main === module) {
  console.log(JSON.stringify(measureBundleSizes(), null, 2));
}
