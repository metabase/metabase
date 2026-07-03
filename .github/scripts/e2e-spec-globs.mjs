import { execFileSync } from "node:child_process";

// Canonical glob set identifying e2e scenario specs — the "universe" the test
// planner selects from (create-test-plan.ts) and the coverage manifest builder
// reconciles against for backfill (build-coverage-manifest.mjs)
export const E2E_SPEC_GLOBS = [
  "e2e/test/scenarios/**/*.cy.spec.js",
  "e2e/test/scenarios/**/*.cy.spec.jsx",
  "e2e/test/scenarios/**/*.cy.spec.ts",
  "e2e/test/scenarios/**/*.cy.spec.tsx",
];

// Tracked spec files matching E2E_SPEC_GLOBS, repo-relative.
export function listSpecFiles(cwd = process.cwd()) {
  return execFileSync("git", ["ls-files", "--", ...E2E_SPEC_GLOBS], {
    cwd,
    encoding: "utf8",
  })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
