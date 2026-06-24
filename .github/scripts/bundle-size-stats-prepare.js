/* eslint-disable import/no-commonjs */
// Prepares the rows the bundle-size stats logger uploads to stats.metabase.com.
//
// For each measured (bundle, kind) it computes the delta — raw, gzipped and
// brotli (as-served) bytes plus percent — against the previously *plotted* data
// point (restored from a rolling cache), so the deltas can be charted directly.
// It also decides whether this commit is worth recording at all: a point is kept
// when the as-served size moved by at least MIN_DELTA_PERCENT, when a new
// bundle/kind appears, or when the build is a tagged release (always kept).
const fs = require("fs");
const path = require("path");

const env = process.env;
const threshold = Number(env.MIN_DELTA_PERCENT ?? 1);

const readJson = filePath => (filePath && fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : null);
const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value));
};
const setOutput = (name, value) => {
  if (env.GITHUB_OUTPUT) {
    fs.appendFileSync(env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
};

const measurements = readJson(env.CURRENT);
if (!Array.isArray(measurements) || measurements.length === 0) {
  console.error(`::error::No bundle measurements found at ${env.CURRENT}`);
  process.exit(1);
}

// The last plotted point, as slim rows: [{ bundle, kind, rawBytes, gzipBytes }].
const previous = readJson(env.LAST) || [];
const previousOf = (bundle, kind) => previous.find(row => row.bundle === bundle && row.kind === kind);

const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const commit = (env.HEAD_SHA || "").slice(0, 12);

// version.properties (extracted from the uberjar) carries the build's tag.
// Non-release (master) builds report tag=vUNKNOWN, so leave Version empty there.
const rawVersion =
  env.VERSION_PROPS && fs.existsSync(env.VERSION_PROPS)
    ? (fs.readFileSync(env.VERSION_PROPS, "utf8").match(/^tag=(.*)$/m)?.[1]?.trim() ?? "")
    : "";
const version = rawVersion === "vUNKNOWN" ? "" : rawVersion;

const deltaPercent = (current, base) =>
  base ? Math.round(((current - base) * 10000) / base) / 100 : "";

// The threshold tracks the as-served size: brotli where the build ships .br,
// otherwise gzip (brotli is null when nothing in the bundle shipped a .br).
let maxServedDeltaPercent = 0;
let hasNewSeries = false;

const rows = measurements.map(measurement => {
  const base = previousOf(measurement.bundle, measurement.kind);
  const hasBrotli = measurement.brotliBytes != null && base?.brotliBytes != null;
  const gzipDeltaPercent = deltaPercent(measurement.gzipBytes, base?.gzipBytes);
  const brotliDeltaPercent = hasBrotli ? deltaPercent(measurement.brotliBytes, base.brotliBytes) : "";
  if (!base) {
    hasNewSeries = true;
  } else {
    const servedDeltaPercent = hasBrotli ? brotliDeltaPercent : gzipDeltaPercent;
    maxServedDeltaPercent = Math.max(maxServedDeltaPercent, Math.abs(servedDeltaPercent));
  }
  return {
    "Date": date,
    "Version": version,
    "Commit": commit,
    "Bundle": measurement.bundle,
    "Kind": measurement.kind, // "initial" or "total"
    "Raw bytes": measurement.rawBytes,
    "Gzip bytes": measurement.gzipBytes,
    "Brotli bytes": measurement.brotliBytes ?? "", // as-served; empty when no .br shipped
    "File count": measurement.fileCount,
    "Raw bytes delta": base ? measurement.rawBytes - base.rawBytes : "",
    "Gzip bytes delta": base ? measurement.gzipBytes - base.gzipBytes : "",
    "Brotli bytes delta": hasBrotli ? measurement.brotliBytes - base.brotliBytes : "",
    "Raw delta %": deltaPercent(measurement.rawBytes, base?.rawBytes),
    "Gzip delta %": gzipDeltaPercent,
    "Brotli delta %": brotliDeltaPercent,
  };
});

// Always keep a point for a tagged release, even when nothing moved.
const isRelease = version !== "";
const firstPoint = previous.length === 0;
const significant = firstPoint || hasNewSeries || isRelease || maxServedDeltaPercent >= threshold;

writeJson(env.ROWS_OUT, rows);

// Stash the current sizes so the next run can diff against this point. The
// workflow only persists this to the cache when we actually push, so the cached
// reference always stays the last *plotted* point (cumulative drift is caught).
writeJson(
  env.CACHE_OUT,
  measurements.map(({ bundle, kind, rawBytes, gzipBytes, brotliBytes }) => ({
    bundle,
    kind,
    rawBytes,
    gzipBytes,
    brotliBytes,
  })),
);

const reason = firstPoint
  ? "first point"
  : hasNewSeries
    ? "new bundle/kind series"
    : isRelease
      ? `release ${version}`
      : `max served Δ ${maxServedDeltaPercent.toFixed(2)}% (threshold ${threshold}%)`;
console.log(`${significant ? "RECORD" : "SKIP"} — ${reason}`);

setOutput("significant", significant ? "true" : "false");
setOutput("max_delta_percent", firstPoint || hasNewSeries ? "" : maxServedDeltaPercent.toFixed(2));
