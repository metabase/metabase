// Changed files come from dorny/paths-filter's `all_changed_files` output

import { execFileSync } from "node:child_process";

import { elements, rules } from "../../frontend/lint/module-boundaries";

import { TEST_SUITES, createTestPlan } from "./affected-tests";

const UNIT_GLOBS = [
  "frontend/src/**/*.unit.spec.js",
  "frontend/src/**/*.unit.spec.jsx",
  "frontend/src/**/*.unit.spec.ts",
  "frontend/src/**/*.unit.spec.tsx",
  "enterprise/frontend/src/**/*.unit.spec.js",
  "enterprise/frontend/src/**/*.unit.spec.jsx",
  "enterprise/frontend/src/**/*.unit.spec.ts",
  "enterprise/frontend/src/**/*.unit.spec.tsx",
];

const STORY_GLOBS = [
  "frontend/**/*.stories.js",
  "frontend/**/*.stories.jsx",
  "frontend/**/*.stories.ts",
  "frontend/**/*.stories.tsx",
  "enterprise/frontend/**/*.stories.js",
  "enterprise/frontend/**/*.stories.jsx",
  "enterprise/frontend/**/*.stories.ts",
  "enterprise/frontend/**/*.stories.tsx",
];

const E2E_GLOBS = [
  "e2e/test/scenarios/**/*.cy.spec.js",
  "e2e/test/scenarios/**/*.cy.spec.jsx",
  "e2e/test/scenarios/**/*.cy.spec.ts",
  "e2e/test/scenarios/**/*.cy.spec.tsx",
];

function listFiles(globs: string[]): string[] {
  return execFileSync("git", ["ls-files", "--", ...globs], { encoding: "utf8" })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

const changedFiles = (process.env.CHANGED_FILES ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const testPlan = createTestPlan({
  elements,
  rules,
  testSuites: TEST_SUITES,
  changedFiles,
  testFilesBySuite: {
    unit: listFiles(UNIT_GLOBS),
    loki: listFiles(STORY_GLOBS),
    e2e: listFiles(E2E_GLOBS),
  },
});

process.stdout.write(JSON.stringify(testPlan) + "\n");
