/**
 * Baseline subtraction used by the manifest builder
 * (build-coverage-manifest.mjs).
 *
 * Booting Metabase executes a large fraction of the FE bundle on every spec
 * (routing, store, shared components, app shell). Raw "statement executed"
 * coverage is therefore dominated by boot noise and is near-useless for
 * deciding which specs a change affects. We instead keep only files
 * where a spec executed a function the boot-only baseline run never reached.
 */

import path from "node:path";

// A spec exercised `file` beyond boot iff it fired some function the baseline run never fired.
// Counts are not comparable: boot code re-fires on every page load,
// so any spec with more than one visit beats the single-boot baseline on every boot file.
// Relies on function indices being identical between baseline and spec,
// which holds because both come from the same instrumented nightly build.
export function fileExceedsBaseline(specFileCov, baselineFileCov) {
  const sf = specFileCov.f || {};
  const bf = baselineFileCov?.f || {};
  for (const [idx, count] of Object.entries(sf)) {
    if (count > 0 && !(bf[idx] > 0)) {
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
// totals. A file survives when the test fired some function the baseline
// spec's single test never fired.
export function discriminatingFilesForTest(
  testDeltas,
  baselineDeltas,
  repoRoot,
) {
  return toRepoRelative(
    Object.entries(testDeltas || {})
      .filter(([file, deltas]) =>
        Object.entries(deltas).some(
          ([idx, count]) => count > 0 && !(baselineDeltas?.[file]?.[idx] > 0),
        ),
      )
      .map(([file]) => file),
    repoRoot,
  );
}

// Merges the baseline spec's per-test entries into a single per-visit noise map.
// The baseline spec has one test. Retried attempts merge by max,
// so a function fired in any attempt counts as boot-fired.
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
