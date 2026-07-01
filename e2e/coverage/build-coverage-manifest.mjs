/**
 * Aggregates per-spec raw coverage written by the after:spec hook in
 * e2e/support/config.js into a single spec → files manifest used for
 * selective e2e runs.
 *
 * For each spec, includes only files whose function counters strictly
 * exceeded the baseline spec's (file-level greater-delta). This strips
 * boot noise — files where every function fired the same count in baseline
 * and spec are treated as "loaded but not exercised by this spec."
 *
 * The manifest stores FILES, not modules: a file's module identity is a
 * derived view that any PR can redraw (by moving files or editing
 * module-boundaries.mjs), so we defer that collapse to selection time, where it
 * runs against the PR's own partition (.github/scripts/affected-tests.ts).
 *
 * `builtAt` records the commit the instrumented run was built from, so an old
 * PR can pick the manifest closest to its own point in history rather than a
 * newer one whose file tree has since drifted.
 *
 * Backfill: a spec missing from today's coverage (its shard failed or flaked)
 * keeps its entry from the previous manifest (PREV_MANIFEST) rather than
 * dropping to "always run", as long as the spec still exists. This is a naive
 * carry-over — a spec whose shard fails repeatedly can silently go stale across
 * nightlies until it runs again.
 *
 * Run after a full instrumented e2e pass:
 *   INSTRUMENT_COVERAGE=true bun run build-release:js
 *   <run cypress, including the coverage-baseline spec>
 *   node e2e/coverage/build-coverage-manifest.mjs
 *
 * Output: e2e/coverage/spec-file-manifest.json
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { listSpecFiles } from "../../.github/scripts/e2e-spec-globs.mjs";

import { discriminatingFiles } from "./baseline.mjs";
import { REPO_ROOT } from "./file-to-module.mjs";

const PER_SPEC_DIR = path.join(REPO_ROOT, "e2e/coverage-manifest-raw");
const OUTPUT_FILE = path.join(REPO_ROOT, "e2e/coverage/spec-file-manifest.json");
const BASELINE_SPEC = "e2e/test/scenarios/coverage-baseline.cy.spec.js";

function readEntry(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// The previous nightly's manifest (downloaded by the merge job) used to backfill
// specs missing from today's run. Missing/unparseable means no backfill.
function loadPrevSpecs() {
  const file = process.env.PREV_MANIFEST;
  if (!file || !fs.existsSync(file)) {
    return null;
  }
  try {
    const { specs } = JSON.parse(fs.readFileSync(file, "utf8"));
    return specs && typeof specs === "object" ? specs : null;
  } catch {
    return null;
  }
}

// The commit this manifest describes. CI passes the instrumented build's SHA;
// fall back to HEAD for local runs.
function builtAtSha() {
  const fromEnv = process.env.MANIFEST_SHA || process.env.GITHUB_SHA;
  if (fromEnv) {
    return fromEnv.trim();
  }
  return execSync("git rev-parse HEAD", {
    cwd: REPO_ROOT,
    encoding: "utf8",
  }).trim();
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
    if (!file.endsWith(".json")) {
      continue;
    }
    const entry = readEntry(path.join(PER_SPEC_DIR, file));
    entries[entry.spec] = entry;
  }

  const baseline = entries[BASELINE_SPEC];
  if (!baseline) {
    console.error(
      `Baseline spec ${BASELINE_SPEC} missing from raw coverage. Did it run?`,
    );
    process.exit(1);
  }

  const specs = {};
  let totalFiles = 0;
  for (const [spec, entry] of Object.entries(entries)) {
    if (spec === BASELINE_SPEC) {
      continue;
    }
    const files = discriminatingFiles(
      entry.coverage,
      baseline.coverage,
      REPO_ROOT,
    );
    specs[spec] = files;
    totalFiles += files.length;
  }

  // Carry over still-existing specs that didn't run today (failed/flaked shard).
  const prev = loadPrevSpecs();
  let backfilled = 0;
  if (prev) {
    // Specs that still exist, so backfill never resurrects deleted ones.
    const current = new Set(listSpecFiles(REPO_ROOT));
    for (const [spec, files] of Object.entries(prev)) {
      if (!(spec in specs) && current.has(spec)) {
        specs[spec] = files;
        totalFiles += files.length;
        backfilled += 1;
      }
    }
  }

  const manifest = { builtAt: builtAtSha(), specs };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2) + "\n");

  const specCount = Object.keys(specs).length;
  const bytes = fs.statSync(OUTPUT_FILE).size;
  console.log(
    `Wrote ${OUTPUT_FILE} (${specCount} specs, ${backfilled} backfilled, ` +
      `${totalFiles} file edges, ${(bytes / 1e6).toFixed(1)} MB, ` +
      `builtAt ${manifest.builtAt.slice(0, 12)}).`,
  );
}

main();
