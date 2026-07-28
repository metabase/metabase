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

// Repo-relative paths of files a spec exercised beyond baseline.
//
// Paths are relativized because Istanbul keys are absolute to the machine that
// produced them (the nightly CI runner) and must resolve against a PR
// checkout's repo root at selection time. Files outside the repo are dropped.
export function discriminatingFiles(coverage, baselineCov, repoRoot) {
  return Object.entries(coverage)
    .filter(([file, fileCov]) =>
      fileExceedsBaseline(fileCov, baselineCov?.[file]),
    )
    .map(([file]) =>
      path.isAbsolute(file) ? path.relative(repoRoot, file) : file,
    )
    .filter((rel) => !rel.startsWith(".."))
    .sort();
}
