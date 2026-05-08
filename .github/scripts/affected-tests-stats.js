// Changed files come from dorny/paths-filter's `all_changed_files` output

const { execFileSync } = require("node:child_process");

const { elements, rules } = require("../../frontend/lint/module-boundaries");

const { SUITES, createTestSelection } = require("./test-suites");

const { decideAll } = createTestSelection({ elements, rules, suites: SUITES });

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

function gitLines(args) {
  return execFileSync("git", args, { encoding: "utf8" })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

const changedFiles = (process.env.CHANGED_FILES ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const result = decideAll({
  changedFiles,
  suiteFiles: {
    unit: gitLines(["ls-files", "--", ...UNIT_GLOBS]),
    loki: gitLines(["ls-files", "--", ...STORY_GLOBS]),
    e2e: gitLines(["ls-files", "--", ...E2E_GLOBS]),
  },
});

console.log(JSON.stringify(result));
