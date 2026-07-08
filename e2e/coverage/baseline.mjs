/**
 * Baseline subtraction used by the manifest builder
 * (build-coverage-manifest.mjs).
 *
 * Booting Metabase executes a large fraction of the FE bundle on every spec
 * (routing, store, shared components, app shell). Raw "statement executed"
 * coverage is therefore dominated by boot noise and is near-useless for
 * deciding which specs a change affects. We instead keep only files a spec
 * exercised MORE than a boot-only baseline run.
 */

import path from "node:path";

// A spec exercised `file` beyond boot iff some function in it fired more times
// than it did in the baseline run. A function that fired the same
// number of times in both is treated as boot-only and ignored. Relies on
// function indices being identical between baseline and spec, which holds
// because both come from the same instrumented nightly build.
export function fileExceedsBaseline(specFileCov, baselineFileCov) {
  const sf = specFileCov.f || {};
  const bf = baselineFileCov?.f || {};
  for (const [idx, count] of Object.entries(sf)) {
    if (count > (bf[idx] || 0)) {
      return true;
    }
  }
  return false;
}

// Istanbul keys are absolute to the machine that produced them (the nightly
// CI runner) and must resolve against a PR checkout's repo root at selection
// time. Files outside the repo are dropped.
function toRepoRelative(files, repoRoot) {
  return files
    .map((file) =>
      path.isAbsolute(file) ? path.relative(repoRoot, file) : file,
    )
    .filter((rel) => !rel.startsWith(".."))
    .sort();
}

// Repo-relative paths of files a spec exercised beyond baseline.
export function discriminatingFiles(coverage, baselineCov, repoRoot) {
  return toRepoRelative(
    Object.entries(coverage)
      .filter(([file, fileCov]) =>
        fileExceedsBaseline(fileCov, baselineCov?.[file]),
      )
      .map(([file]) => file),
    repoRoot,
  );
}

// Per-test variant of discriminatingFiles. `testDeltas` and `baselineDeltas`
// are sparse {file: {fnIdx: firedCount}} maps as recorded by the
// recordTestCapture task — counter deltas for a single test, not cumulative
// totals. A file survives when some function fired more times during the test
// than during the baseline spec's boot-and-visit test, so single-visit boot
// noise cancels out just like at the spec level.
export function discriminatingFilesForTest(
  testDeltas,
  baselineDeltas,
  repoRoot,
) {
  return toRepoRelative(
    Object.entries(testDeltas || {})
      .filter(([file, deltas]) =>
        Object.entries(deltas).some(
          ([idx, count]) => count > (baselineDeltas?.[file]?.[idx] || 0),
        ),
      )
      .map(([file]) => file),
    repoRoot,
  );
}

// Merges the baseline spec's per-test entries into a single per-visit noise
// map. The baseline spec has one test; retried attempts merge by max so the
// subtraction stays strict.
export function baselinePerTestDeltas(baselineEntry) {
  const merged = {};
  for (const test of baselineEntry?.tests || []) {
    for (const [file, deltas] of Object.entries(test.f || {})) {
      const fileMax = (merged[file] ??= {});
      for (const [idx, count] of Object.entries(deltas)) {
        if (count > (fileMax[idx] || 0)) {
          fileMax[idx] = count;
        }
      }
    }
  }
  return merged;
}
