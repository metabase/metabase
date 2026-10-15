import { execFileSync } from "node:child_process";

import micromatch from "micromatch";

const SPEC_DIR = "e2e/test/scenarios";

// This is the nightly-only baseline helper that runs in the instrumented pass to
// capture boot-time coverage. It is not a product spec, so it is excluded from
// the test plan universe and from the manifest backfill reconciliation.
export const BASELINE_SPEC = `${SPEC_DIR}/coverage-baseline.cy.spec.js`;

// This glob set defines the spec "universe". The test planner
// (create-test-plan.ts) selects which specs to run from it, and the coverage
// manifest builder (build-coverage-manifest.mjs) reconciles against it when
// backfilling specs that did not run.
export const E2E_SPEC_GLOBS = [`${SPEC_DIR}/**/*.cy.spec.{js,jsx,ts,tsx}`];

// Returns the tracked e2e specs as repo-relative paths, excluding the baseline
// helper.
export function listSpecFiles(cwd = process.cwd()) {
  const tracked = execFileSync("git", ["ls-files", "--", SPEC_DIR], {
    cwd,
    encoding: "utf8",
  })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return micromatch(tracked, E2E_SPEC_GLOBS, {
    ignore: [BASELINE_SPEC],
    dot: true,
  });
}
