/**
 * Aggregates per-spec raw coverage written by the after:spec hook in
 * e2e/support/config.js into a single spec → modules manifest used for
 * selective e2e runs.
 *
 * For each spec, includes only files whose function counters strictly
 * exceeded the baseline spec's (file-level greater-delta). This strips
 * boot noise — files where every function fired the same count in baseline
 * and spec are treated as "loaded but not exercised by this spec."
 *
 * Run after a full instrumented e2e pass:
 *   INSTRUMENT_COVERAGE=true bun run build-release:js
 *   <run cypress, including the coverage-baseline spec>
 *   node e2e/coverage/build-coverage-manifest.mjs
 *
 * Output: e2e/coverage/spec-module-manifest.json
 */

import fs from "node:fs";
import path from "node:path";

import { REPO_ROOT, fileToModule } from "./file-to-module.mjs";

const PER_SPEC_DIR = path.join(REPO_ROOT, "e2e/coverage-manifest-raw");
const OUTPUT_FILE = path.join(
  REPO_ROOT,
  "e2e/coverage/spec-module-manifest.json",
);
const BASELINE_SPEC = "e2e/test/scenarios/coverage-baseline.cy.spec.js";

function readEntry(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// A spec invoked a file "in addition" to baseline iff any function in the
// file has a higher count in the spec than in baseline. Functions that
// fired identically in both are treated as boot-only.
function fileExceedsBaseline(specFileCov, baselineFileCov) {
  const sf = specFileCov.f || {};
  const bf = baselineFileCov?.f || {};
  for (const [idx, count] of Object.entries(sf)) {
    if (count > (bf[idx] || 0)) return true;
  }
  return false;
}

function specFromEntry(entry) {
  return entry.spec;
}

function specModules(specCoverage, baselineCoverage) {
  const modules = new Set();
  let unmapped = 0;
  for (const [file, fc] of Object.entries(specCoverage)) {
    if (!fileExceedsBaseline(fc, baselineCoverage[file])) continue;
    const m = fileToModule(file);
    if (m) modules.add(m);
    else unmapped += 1;
  }
  return { modules: [...modules].sort(), unmapped };
}

function main() {
  if (!fs.existsSync(PER_SPEC_DIR)) {
    console.error(`No per-spec coverage at ${PER_SPEC_DIR}.`);
    console.error("Run the instrumented Cypress pass first.");
    process.exit(1);
  }

  // Load every per-spec entry, find the baseline.
  const entries = {};
  for (const file of fs.readdirSync(PER_SPEC_DIR)) {
    if (!file.endsWith(".json")) continue;
    const entry = readEntry(path.join(PER_SPEC_DIR, file));
    entries[specFromEntry(entry)] = entry;
  }

  const baseline = entries[BASELINE_SPEC];
  if (!baseline) {
    console.error(
      `Baseline spec ${BASELINE_SPEC} missing from raw coverage. Did it run?`,
    );
    process.exit(1);
  }

  const manifest = {};
  let totalUnmapped = 0;
  for (const [spec, entry] of Object.entries(entries)) {
    if (spec === BASELINE_SPEC) continue;
    const { modules, unmapped } = specModules(entry.coverage, baseline.coverage);
    manifest[spec] = modules;
    totalUnmapped += unmapped;
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2) + "\n");
  const specCount = Object.keys(manifest).length;
  console.log(`Wrote ${OUTPUT_FILE} (${specCount} specs).`);
  if (totalUnmapped > 0) {
    console.log(
      `Note: ${totalUnmapped} files matched no module (node_modules/cljs/build output).`,
    );
  }
}

main();
