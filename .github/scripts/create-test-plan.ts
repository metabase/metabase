// I/O entrypoint: gather inputs (env vars, the cruise graph, the test-file
// lists) and hand them to createTestPlan, which does the computing.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import { elements, rules } from "../../frontend/lint/module-boundaries.mjs";

import { type FileDependency, parseCruiseModules } from "./affected-modules";
import { createTestPlan } from "./affected-tests";

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

// dorny outputs comma-separated lists; CHANGED_FILES is `all_changed_files`.
const csvToList = (csv: string | undefined) =>
  (csv ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

// Reads the dependency-cruiser graph (DEP_GRAPH_JSON). Null falls back to the
// rules graph, so a missing or unparseable file never breaks the plan.
function readFileDependencies(): FileDependency[] | null {
  const path = process.env.DEP_GRAPH_JSON;
  if (path && existsSync(path)) {
    try {
      const { modules } = JSON.parse(readFileSync(path, "utf8"));
      process.stderr.write(`Using usage graph from ${path}.\n`);
      return parseCruiseModules(modules);
    } catch (error) {
      process.stderr.write(
        `Failed to read ${path}; falling back to rules graph: ${error}\n`,
      );
    }
  } else {
    process.stderr.write(
      "No DEP_GRAPH_JSON found; falling back to rules graph.\n",
    );
  }
  return null;
}

const testPlan = createTestPlan({
  elements,
  rules,
  changedFiles: csvToList(process.env.CHANGED_FILES),
  fileDependencies: readFileDependencies(),
  testFilesBySuite: {
    unit: listFiles(UNIT_GLOBS),
    loki: listFiles(STORY_GLOBS),
    e2e: listFiles(E2E_GLOBS),
  },
  unitInfraTouched: process.env.UNIT_INFRA_TOUCHED === "true",
  lokiInfraTouched: process.env.LOKI_INFRA_TOUCHED === "true",
  sharedSourcesTouched: process.env.SHARED_SOURCES_TOUCHED === "true",
  feFilesChanged: csvToList(process.env.FE_CHANGED_FILES).length,
  beFilesChanged: csvToList(process.env.BE_CHANGED_FILES).length,
});

process.stdout.write(JSON.stringify(testPlan) + "\n");
