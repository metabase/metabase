/* eslint-disable import/no-commonjs */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SDK_ROOT = "resources/frontend_client/app/embedding-sdk";

/**
 * Async SDK chunks are unreachable today: the bootstrap manifest lists only the
 * chunked entry's INITIAL chunks and output.publicPath is "", so import() chunks
 * are emitted but never fetched. So they're excluded from "total" (which equals
 * "initial"). There's no reliable way to detect loadability from the build
 * artifacts, so this is a manual flag: flip it to true in the same change that
 * lands the publicPath fix, and "total" will include the lazy chunks while
 * "initial" stays the eager first-load set.
 */
const SDK_ASYNC_CHUNKS_LOADABLE = false;

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
  const statsPath = path.resolve(process.cwd(), statsFile);
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
  const base = root ? path.resolve(process.cwd(), root) : joinRoot;
  return assets.map(name => path.join(base, name));
}

function measureSimpleTarget({ bundle, dir, file, altFile, stats, optional }) {
  const candidates = [dir, file, altFile].filter(Boolean);
  const chosen = candidates.find(c => fs.existsSync(path.resolve(process.cwd(), c)));
  if (!chosen) {
    if (optional) {
      console.warn(`Skipping "${bundle}": output not found (${candidates.join(", ")})`);
      return [];
    }
    throw new Error(`Bundle output not found for "${bundle}": ${candidates.join(", ")}`);
  }

  const root = path.resolve(process.cwd(), chosen);
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
  const chunksDir = path.resolve(process.cwd(), SDK_ROOT, "chunks");
  if (!fs.existsSync(chunksDir)) {
    // pre-chunked layout (monolith only) — nothing to measure here
    return [];
  }

  const absRoot = path.resolve(process.cwd(), SDK_ROOT);
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
    ...simpleTargets.flatMap(measureSimpleTarget),
    ...measureChunkedSdk("artifacts/stats-embedding-sdk.json"),
  ];
}

module.exports = { measureBundleSizes };

if (require.main === module) {
  console.log(JSON.stringify(measureBundleSizes(), null, 2));
}
