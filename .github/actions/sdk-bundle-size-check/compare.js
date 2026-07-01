/* eslint-disable import/no-commonjs */
// Diffs the bundle sizes produced by measure-bundle-sizes.js for the current
// build and the base ref. Every (bundle, kind) is compared strictly against the
// same (bundle, kind) — never one bundle type against another — using gzipped
// (served) bytes. The gate is driven by the chunked SDK's reachable total, which
// is what the SDK actually delivers.
//
// compareBundles is pure (data in, data out) so it can be unit-tested; main()
// is the thin I/O wrapper that reads the size files, prints the report and sets
// the step outputs / exit code.
const fs = require("fs");

const pick = (rows, bundle, kind) => rows.find(row => row.bundle === bundle && row.kind === kind);
const keyOf = row => `${row.bundle}/${row.kind}`;
const mb = bytes => (bytes / 1024 / 1024).toFixed(2);
const percentOf = (currentBytes, baseBytes) =>
  baseBytes ? Math.trunc(((currentBytes - baseBytes) * 100) / baseBytes) : 0;

/**
 * Compare two measurement sets and decide the gate. Returns a human-readable
 * `report` (always), and exactly one of:
 *  - `gate`  { status, percent }: the chunked SDK total moved by `percent`.
 *  - `skip`  reason: the gate is non-actionable (report stable, no comment).
 *  - `error` reason: the gate inputs are missing (hard failure).
 */
function compareBundles({ current, base, threshold }) {
  const report = ["=== Bundle sizes (gzipped, current vs base) ==="];
  const keys = [...new Set([...current, ...base].map(keyOf))].sort();
  for (const key of keys) {
    const [bundle, kind] = key.split("/");
    const currentRow = pick(current, bundle, kind);
    const baseRow = pick(base, bundle, kind);
    if (!currentRow || !baseRow) {
      report.push(`${key}: present only in ${currentRow ? "current" : "base"} build`);
      continue;
    }
    const diff = currentRow.gzipBytes - baseRow.gzipBytes;
    const percent = percentOf(currentRow.gzipBytes, baseRow.gzipBytes);
    report.push(`${key}: ${mb(currentRow.gzipBytes)}MB vs ${mb(baseRow.gzipBytes)}MB (${percent}%, ${diff} bytes)`);
  }

  // Gate on the chunked SDK's reachable total (gzipped) — what the SDK ships.
  const gateCurrent = pick(current, "embedding-sdk-chunked", "total");
  const gateBase = pick(base, "embedding-sdk-chunked", "total");
  if (!gateCurrent || !gateBase || !gateBase.gzipBytes) {
    return { report, error: "Could not find embedding-sdk-chunked total (gzip) in both builds" };
  }

  // Both sides must measure "total" the same way. A base ref built before the
  // reachableAssets enrichment collapses its total to the initial set, so
  // comparing it against the current reachable total reports a phantom jump
  // (~30%). Skip until the base ref also carries reachable stats (i.e. once
  // this change is on the base).
  if (Boolean(gateCurrent.reachable) !== Boolean(gateBase.reachable)) {
    return {
      report,
      skip:
        `chunked "total" measured differently on each side ` +
        `(current reachable=${Boolean(gateCurrent.reachable)}, base reachable=${Boolean(gateBase.reachable)}); ` +
        `the base ref predates the reachable-chunk stats. Resolves once this change is on the base ref.`,
    };
  }

  const percent = percentOf(gateCurrent.gzipBytes, gateBase.gzipBytes);
  const status = percent > threshold ? "increased" : percent < -threshold ? "decreased" : "stable";
  return { report, gate: { status, percent } };
}

module.exports = { compareBundles };

const setOutput = (name, value) => {
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
};

function main() {
  const [, , currentPath, basePath] = process.argv;
  const threshold = Number(process.env.THRESHOLD ?? 2);

  const current = JSON.parse(fs.readFileSync(currentPath, "utf8"));
  const base = JSON.parse(fs.readFileSync(basePath, "utf8"));

  const { report, gate, skip, error } = compareBundles({ current, base, threshold });
  console.log(report.join("\n"));

  if (error) {
    console.error(`::error::${error}`);
    process.exit(1);
  }

  if (skip) {
    // Treat the gate as non-actionable: report stable so no regression comment
    // is posted, mirroring the shell skip() for missing artifacts.
    console.log(`::notice::Embedding SDK bundle-size gate skipped: ${skip}`);
    setOutput("status", "stable");
    setOutput("size_change_percent", "0");
    process.exit(0);
  }

  console.log("");
  console.log(`Gate: embedding-sdk-chunked total ${gate.percent}% (threshold ${threshold}%) → ${gate.status}`);

  setOutput("status", gate.status);
  setOutput("size_change_percent", gate.percent);
}

if (require.main === module) {
  main();
}
