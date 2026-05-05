// Used by the decide-what-runs job in .github/workflows/run-tests.yml.
// Test files are listed via `git ls-files` (no glob lib needed) so counts
// match what's tracked at HEAD.

const { execFileSync } = require("node:child_process");

const {
  elements,
  rules,
} = require("../../frontend/lint/module-boundaries");
const { SUITES, createTestSelection } = require("./test-suites");

const { decideAll } = createTestSelection({ elements, rules, suites: SUITES });

const BASE_SHA = process.env.BASE_SHA;
const HEAD_SHA = process.env.HEAD_SHA ?? "HEAD";

if (!BASE_SHA) {
  console.error("BASE_SHA env var is required");
  process.exit(1);
}

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

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

function gitLines(args) {
  return git(args)
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

const changedFiles = gitLines([
  "diff",
  "--name-only",
  `${BASE_SHA}...${HEAD_SHA}`,
]);

const result = decideAll({
  changedFiles,
  suiteFiles: {
    unit: gitLines(["ls-files", "--", ...UNIT_GLOBS]),
    loki: gitLines(["ls-files", "--", ...STORY_GLOBS]),
    e2e: gitLines(["ls-files", "--", ...E2E_GLOBS]),
  },
});

console.log(JSON.stringify(result));
