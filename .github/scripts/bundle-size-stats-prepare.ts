// Prepares the rows the bundle-size stats logger imports into eng-stats-importer.
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
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

/** One measurement emitted by measure-bundle-sizes. */
export interface Measurement {
  bundle: string;
  kind: "initial" | "total";
  rawBytes: number;
  gzipBytes: number;
  brotliBytes: number;
  fileCount: number;
}

/**
 * The slim row cached between runs, holding the last *plotted* point.
 * `brotliBytes` is optional because a point cached before brotli logging
 * landed does not carry it — see buildStatsRows' per-row gzip fallback.
 */
export type CacheRow = Pick<Measurement, "bundle" | "kind" | "rawBytes" | "gzipBytes"> & {
  brotliBytes?: number;
};

export interface BuildStatsRowsInput {
  measurements: Measurement[];
  previous: CacheRow[];
  threshold: number;
  date: string;
  commit: string;
  commitMessage: string;
  version: string;
}

/** An upload row, keyed by the importer's column display names. */
export type StatsRow = Record<string, string | number | null>;

export interface BuildStatsRowsResult {
  rows: StatsRow[];
  cacheRows: CacheRow[];
  significant: boolean;
  reason: string;
  maxServedDeltaPercent: number;
  firstPoint: boolean;
  hasNewSeries: boolean;
}

// null, not "", for an absent delta: the stats importer coerces values
// strictly and rejects "" for a numeric column.
const deltaPercent = (current: number, base: number | undefined | null): number | null =>
  base ? Math.round(((current - base) * 10000) / base) / 100 : null;

/**
 * Turn the current measurements + the last plotted point into upload rows, the
 * slim cache rows for the next diff, and the keep/skip decision.
 *
 * The significance threshold tracks the as-served size: brotli where the build
 * ships a precompressed .br, otherwise gzip. Current measurements always carry
 * brotliBytes (estimated when no .br shipped), but a cached base point recorded
 * before brotli logging may not, so the delta still falls back to gzip per row.
 */
export function buildStatsRows({
  measurements,
  previous,
  threshold,
  date,
  commit,
  commitMessage,
  version,
}: BuildStatsRowsInput): BuildStatsRowsResult {
  const previousOf = (bundle: string, kind: string) =>
    previous.find((row) => row.bundle === bundle && row.kind === kind);

  let maxServedDeltaPercent = 0;
  let hasNewSeries = false;

  const rows = measurements.map((measurement): StatsRow => {
    const base = previousOf(measurement.bundle, measurement.kind);
    // Non-null only when BOTH sides carry brotli: a point cached before brotli
    // logging landed has none, and that row falls back to the gzip delta.
    const baseBrotli =
      measurement.brotliBytes != null && base?.brotliBytes != null ? base.brotliBytes : null;
    const gzipDeltaPercent = deltaPercent(measurement.gzipBytes, base?.gzipBytes);
    const brotliDeltaPercent =
      baseBrotli != null ? deltaPercent(measurement.brotliBytes, baseBrotli) : null;
    if (!base) {
      hasNewSeries = true;
    } else {
      const servedDeltaPercent = baseBrotli != null ? brotliDeltaPercent : gzipDeltaPercent;
      maxServedDeltaPercent = Math.max(maxServedDeltaPercent, Math.abs(servedDeltaPercent ?? 0));
    }
    return {
      Date: date,
      Version: version,
      Commit: commit,
      Bundle: measurement.bundle,
      Kind: measurement.kind, // "initial" or "total"
      // The stats table carries a free-text Description column. Populate it
      // with the commit subject so the chart's points are self-describing.
      Description: commitMessage,
      "Raw bytes": measurement.rawBytes,
      "Gzip bytes": measurement.gzipBytes,
      "Brotli bytes": measurement.brotliBytes, // as-served (shipped .br, else estimated)
      "File count": measurement.fileCount,
      "Raw bytes delta": base ? measurement.rawBytes - base.rawBytes : null,
      "Gzip bytes delta": base ? measurement.gzipBytes - base.gzipBytes : null,
      "Brotli bytes delta": baseBrotli != null ? measurement.brotliBytes - baseBrotli : null,
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
  const cacheRows = measurements.map(
    ({ bundle, kind, rawBytes, gzipBytes, brotliBytes }): CacheRow => ({
      bundle,
      kind,
      rawBytes,
      gzipBytes,
      brotliBytes,
    }),
  );

  const reason = firstPoint
    ? "first point"
    : hasNewSeries
      ? "new bundle/kind series"
      : `max served Δ ${maxServedDeltaPercent.toFixed(2)}% (threshold ${threshold}%)`;

  return {
    rows,
    cacheRows,
    significant,
    reason,
    maxServedDeltaPercent,
    firstPoint,
    hasNewSeries,
  };
}

const readJson = <T,>(filePath: string | undefined): T | null =>
  filePath && existsSync(filePath) ? (JSON.parse(readFileSync(filePath, "utf8")) as T) : null;

const writeJson = (filePath: string, value: unknown) => {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value));
};

const setOutput = (name: string, value: string) => {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
};

// version.properties (extracted from the uberjar) carries the build's tag.
// Non-release (master) builds report tag=vUNKNOWN, so leave Version empty there.
function readVersion(versionPropsPath: string | undefined): string {
  const raw =
    versionPropsPath && existsSync(versionPropsPath)
      ? (readFileSync(versionPropsPath, "utf8").match(/^tag=(.*)$/m)?.[1]?.trim() ?? "")
      : "";
  return raw === "vUNKNOWN" ? "" : raw;
}

export function main() {
  const env = process.env;

  const measurements = readJson<Measurement[]>(env.CURRENT);
  if (!Array.isArray(measurements) || measurements.length === 0) {
    console.error(`::error::No bundle measurements found at ${env.CURRENT}`);
    process.exit(1);
  }

  const result = buildStatsRows({
    measurements,
    // The last plotted point, as slim rows: [{ bundle, kind, rawBytes, gzipBytes, brotliBytes }].
    previous: readJson<CacheRow[]>(env.LAST) || [],
    threshold: Number(env.MIN_DELTA_PERCENT ?? 1),
    date: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
    commit: (env.HEAD_SHA || "").slice(0, 12),
    commitMessage: (env.COMMIT_MESSAGE || "").split("\n")[0], // subject line only
    version: readVersion(env.VERSION_PROPS),
  });

  writeJson(env.ROWS_OUT!, result.rows);
  writeJson(env.CACHE_OUT!, result.cacheRows);

  console.log(`${result.significant ? "RECORD" : "SKIP"} — ${result.reason}`);

  setOutput("significant", result.significant ? "true" : "false");
  setOutput(
    "max_delta_percent",
    result.firstPoint || result.hasNewSeries ? "" : result.maxServedDeltaPercent.toFixed(2),
  );
}

// Only run the I/O wrapper when invoked directly, so importing buildStatsRows
// (from the spec) has no side effects.
if ((import.meta as ImportMeta & { main?: boolean }).main) {
  main();
}
