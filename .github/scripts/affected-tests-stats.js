// Reads a base/head ref pair from env, computes affected-module stats for the
// PR diff, and prints the result as JSON to stdout. Wired up by
// .github/workflows/affected-tests-stats.yml.
//
// Test files (unit specs, stories) are listed via `git ls-files` so the count
// matches what's tracked in the PR's HEAD revision — no glob libs needed.

const { execFileSync } = require("node:child_process");

const { computeStats } = require("../../frontend/lint/affected-tests");

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

const unitTestFiles = gitLines(["ls-files", "--", ...UNIT_GLOBS]);
const storyFiles = gitLines(["ls-files", "--", ...STORY_GLOBS]);

const stats = computeStats({ changedFiles, unitTestFiles, storyFiles });

console.log(JSON.stringify(stats));
