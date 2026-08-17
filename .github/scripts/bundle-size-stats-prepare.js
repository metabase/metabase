/* eslint-disable import/no-commonjs */
// Prepares the rows the bundle-size stats logger uploads to stats.metabase.com.
//
// For each measured (bundle, kind) it computes the delta — raw, gzipped and
// brotli (as-served) bytes plus percent — against the previously *plotted* data
// point (restored from a rolling cache), so the deltas can be charted directly.
// It also decides whether this commit is worth recording at all: a point is kept
// when the as-served size moved by at least MIN_DELTA_PERCENT, or when a new
// bundle/kind appears. Only master builds run through here — releases form
// non-linear lines whose deltas are meaningless, so they're not recorded (their
// historical sizes are backfilled separately).
//
// buildStatsRows is pure (data in, data out) so it can be unit-tested; main()
// is the thin I/O wrapper that reads env/files and writes the rows, cache and
// step outputs.
const fs = require("fs");
const path = require("path");

const deltaPercent = (current, base) =>
  base ? Math.round(((current - base) * 10000) / base) / 100 : "";

/**
 * Turn the current measurements + the last plotted point into upload rows, the
 * slim cache rows for the next diff, and the keep/skip decision.
 *
 * The significance threshold tracks the as-served size: brotli where the build
 * ships a precompressed .br, otherwise gzip. Current measurements always carry
 * brotliBytes (estimated when no .br shipped), but a cached base point recorded
 * before brotli logging may not, so the delta still falls back to gzip per row.
 */
function buildStatsRows({ measurements, previous, threshold, date, commit, commitMessage, version }) {
  const previousOf = (bundle, kind) => previous.find(row => row.bundle === bundle && row.kind === kind);

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
      // The stats table carries a free-text Description column; append-csv
      // requires every table column to be present. Populate it with the commit
      // subject so the chart's points are self-describing.
      "Description": commitMessage,
      "Raw bytes": measurement.rawBytes,
      "Gzip bytes": measurement.gzipBytes,
      "Brotli bytes": measurement.brotliBytes, // as-served (shipped .br, else estimated)
      "File count": measurement.fileCount,
      "Raw bytes delta": base ? measurement.rawBytes - base.rawBytes : "",
      "Gzip bytes delta": base ? measurement.gzipBytes - base.gzipBytes : "",
      "Brotli bytes delta": hasBrotli ? measurement.brotliBytes - base.brotliBytes : "",
      "Raw delta %": deltaPercent(measurement.rawBytes, base?.rawBytes),
      "Gzip delta %": gzipDeltaPercent,
      "Brotli delta %": brotliDeltaPercent,
    };
  });

  const firstPoint = previous.length === 0;
  const significant = firstPoint || hasNewSeries || maxServedDeltaPercent >= threshold;

  // Slim rows the next run diffs against. The workflow only persists this to the
  // cache when we actually push, so the cached reference always stays the last
  // *plotted* point (cumulative drift is caught).
  const cacheRows = measurements.map(({ bundle, kind, rawBytes, gzipBytes, brotliBytes }) => ({
    bundle,
    kind,
    rawBytes,
    gzipBytes,
    brotliBytes,
  }));

  const reason = firstPoint
    ? "first point"
    : hasNewSeries
      ? "new bundle/kind series"
      : `max served Δ ${maxServedDeltaPercent.toFixed(2)}% (threshold ${threshold}%)`;

  return { rows, cacheRows, significant, reason, maxServedDeltaPercent, firstPoint, hasNewSeries };
}

module.exports = { buildStatsRows };

const readJson = filePath => (filePath && fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : null);
const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value));
};
const setOutput = (env, name, value) => {
  if (env.GITHUB_OUTPUT) {
    fs.appendFileSync(env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
};

// version.properties (extracted from the uberjar) carries the build's tag.
// Non-release (master) builds report tag=vUNKNOWN, so leave Version empty there.
function readVersion(versionPropsPath) {
  const raw =
    versionPropsPath && fs.existsSync(versionPropsPath)
      ? (fs.readFileSync(versionPropsPath, "utf8").match(/^tag=(.*)$/m)?.[1]?.trim() ?? "")
      : "";
  return raw === "vUNKNOWN" ? "" : raw;
}

function main() {
  const env = process.env;

  const measurements = readJson(env.CURRENT);
  if (!Array.isArray(measurements) || measurements.length === 0) {
    console.error(`::error::No bundle measurements found at ${env.CURRENT}`);
    process.exit(1);
  }

  const result = buildStatsRows({
    measurements,
    // The last plotted point, as slim rows: [{ bundle, kind, rawBytes, gzipBytes, brotliBytes }].
    previous: readJson(env.LAST) || [],
    threshold: Number(env.MIN_DELTA_PERCENT ?? 1),
    date: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
    commit: (env.HEAD_SHA || "").slice(0, 12),
    commitMessage: (env.COMMIT_MESSAGE || "").split("\n")[0], // subject line only
    version: readVersion(env.VERSION_PROPS),
  });

  writeJson(env.ROWS_OUT, result.rows);
  writeJson(env.CACHE_OUT, result.cacheRows);

  console.log(`${result.significant ? "RECORD" : "SKIP"} — ${result.reason}`);

  setOutput(env, "significant", result.significant ? "true" : "false");
  setOutput(
    env,
    "max_delta_percent",
    result.firstPoint || result.hasNewSeries ? "" : result.maxServedDeltaPercent.toFixed(2),
  );
}

if (require.main === module) {
  main();
}
