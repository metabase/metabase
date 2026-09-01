/* eslint-disable import/no-commonjs */
// Diffs the bundle sizes produced by measure-bundle-sizes.js for the current
// build and the base ref. Every (bundle, kind) is compared strictly against the
// same (bundle, kind) — never one bundle type against another — using gzipped
// (served) bytes.
//
// The report covers every measured bundle; the gates are the subset that drives
// PR comments, named as "<bundle>/<kind>" (e.g. "app/initial",
// "embedding-sdk-chunked/total").
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

// Output names are derived from the gate key, so the workflow reads
// `app_initial_status`, `embedding_sdk_chunked_total_status`, and so on.
const outputPrefix = gateKey => gateKey.replace(/[^a-zA-Z0-9]+/g, "_");

/**
 * Evaluate one gate. Returns the key plus exactly one of:
 *  - `status` / `percent`: the bundle moved by `percent`.
 *  - `skip`  reason: the gate is non-actionable (reported stable, no comment).
 *  - `error` reason: the gate inputs are missing (hard failure).
 */
function evaluateGate({ current, base, threshold, gateKey }) {
  const [bundle, kind] = gateKey.split("/");
  const gateCurrent = pick(current, bundle, kind);
  const gateBase = pick(base, bundle, kind);
  if (!gateCurrent || !gateBase || !gateBase.gzipBytes) {
    return { gateKey, error: `Could not find ${bundle} ${kind} (gzip) in both builds` };
  }

  // Both sides must measure the bundle the same way. A base ref built before the
  // reachableAssets enrichment collapses its total to the initial set, so
  // comparing it against the current reachable total reports a phantom jump
  // (~30%). Skip until the base ref also carries reachable stats.
  if (Boolean(gateCurrent.reachable) !== Boolean(gateBase.reachable)) {
    return {
      gateKey,
      skip:
        `"${gateKey}" measured differently on each side ` +
        `(current reachable=${Boolean(gateCurrent.reachable)}, base reachable=${Boolean(gateBase.reachable)}); ` +
        `the base ref predates the reachable-chunk stats. Resolves once this change is on the base ref.`,
    };
  }

  const percent = percentOf(gateCurrent.gzipBytes, gateBase.gzipBytes);
  const status = percent > threshold ? "increased" : percent < -threshold ? "decreased" : "stable";
  return { gateKey, status, percent };
}

/**
 * Compare two measurement sets and evaluate every gate. Returns a
 * human-readable `report` over all measured bundles plus one entry per gate.
 */
function compareBundles({ current, base, threshold, gateKeys }) {
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

  return { report, gates: gateKeys.map(gateKey => evaluateGate({ current, base, threshold, gateKey })) };
}

module.exports = { compareBundles, outputPrefix };

const setOutput = (name, value) => {
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
};

function main() {
  const [, , currentPath, basePath] = process.argv;
  const threshold = Number(process.env.THRESHOLD ?? 2);
  const gateKeys = (process.env.GATES ?? "embedding-sdk-chunked/total").split(",").map(key => key.trim());

  const current = JSON.parse(fs.readFileSync(currentPath, "utf8"));
  const base = JSON.parse(fs.readFileSync(basePath, "utf8"));

  const { report, gates } = compareBundles({ current, base, threshold, gateKeys });
  console.log(report.join("\n"));
  console.log("");

  for (const gate of gates) {
    const prefix = outputPrefix(gate.gateKey);

    if (gate.error) {
      // One broken gate must not hide the others, so report them all and fail
      // the step at the end.
      console.error(`::error::${gate.error}`);
      continue;
    }

    if (gate.skip) {
      // Treat the gate as non-actionable: report stable so no regression comment
      // is posted, mirroring the shell skip() for missing artifacts.
      console.log(`::notice::Bundle-size gate skipped: ${gate.skip}`);
      setOutput(`${prefix}_status`, "stable");
      setOutput(`${prefix}_size_change_percent`, "0");
      continue;
    }

    console.log(`Gate: ${gate.gateKey} ${gate.percent}% (threshold ${threshold}%) → ${gate.status}`);
    setOutput(`${prefix}_status`, gate.status);
    setOutput(`${prefix}_size_change_percent`, gate.percent);
  }

  if (gates.some(gate => gate.error)) {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
