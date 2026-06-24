/* eslint-disable import/no-commonjs */
// Prepares the rows the bundle-size stats logger uploads to stats.metabase.com.
//
// For each measured (bundle, kind) it computes the delta — raw and gzipped bytes
// plus percent — against the previously *plotted* data point (restored from a
// rolling cache), so the deltas can be charted directly. It also decides whether
// this commit is worth recording at all: a point is kept only when something
// moved by at least MIN_DELTA_PERCENT (gzipped), keeping the time series to
// commits that actually changed a bundle.
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

let maxGzipDeltaPercent = 0;
let hasNewSeries = false;

const rows = measurements.map(measurement => {
  const base = previousOf(measurement.bundle, measurement.kind);
  if (!base) {
    hasNewSeries = true;
  } else {
    maxGzipDeltaPercent = Math.max(
      maxGzipDeltaPercent,
      Math.abs(deltaPercent(measurement.gzipBytes, base.gzipBytes)),
    );
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
    "Raw delta %": deltaPercent(measurement.rawBytes, base?.rawBytes),
    "Gzip delta %": deltaPercent(measurement.gzipBytes, base?.gzipBytes),
  };
});

const firstPoint = previous.length === 0;
const significant = firstPoint || hasNewSeries || maxGzipDeltaPercent >= threshold;

writeJson(env.ROWS_OUT, rows);

// Stash the current sizes so the next run can diff against this point. The
// workflow only persists this to the cache when we actually push, so the cached
// reference always stays the last *plotted* point (cumulative drift is caught).
writeJson(
  env.CACHE_OUT,
  measurements.map(({ bundle, kind, rawBytes, gzipBytes }) => ({ bundle, kind, rawBytes, gzipBytes })),
);

const reason = firstPoint
  ? "first point"
  : hasNewSeries
    ? "new bundle/kind series"
    : `max gzip Δ ${maxGzipDeltaPercent.toFixed(2)}% (threshold ${threshold}%)`;
console.log(`${significant ? "RECORD" : "SKIP"} — ${reason}`);

setOutput("significant", significant ? "true" : "false");
setOutput("max_delta_percent", firstPoint || hasNewSeries ? "" : maxGzipDeltaPercent.toFixed(2));
