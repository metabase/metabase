// I/O entrypoint: gather inputs (env vars, the cruise graph, the test-file
// lists) and hand them to createTestPlan, which does the computing.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import micromatch from "micromatch";

import { elements, rules } from "../../frontend/lint/module-boundaries.mjs";

import { type FileDependency, parseCruiseModules } from "./affected-modules";
import { createTestPlan } from "./affected-tests";
import { listSpecFiles } from "./e2e-spec-globs.mjs";

const UNIT_ROOTS = ["frontend/src", "enterprise/frontend/src"];
const UNIT_GLOBS = [
  "frontend/src/**/*.unit.spec.{js,jsx,ts,tsx}",
  "enterprise/frontend/src/**/*.unit.spec.{js,jsx,ts,tsx}",
];

const STORY_ROOTS = ["frontend", "enterprise/frontend"];
const STORY_GLOBS = [
  "frontend/**/*.stories.{js,jsx,ts,tsx}",
  "enterprise/frontend/**/*.stories.{js,jsx,ts,tsx}",
];

// Returns the tracked files under `roots` that match `globs`. The `dot: true`
// option means files inside dot-directories such as `.storybook` are included.
function listFiles(roots: string[], globs: string[]): string[] {
  const tracked = execFileSync("git", ["ls-files", "--", ...roots], {
    encoding: "utf8",
  })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return micromatch(tracked, globs, { dot: true });
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

// Reads the nightly coverage manifest (E2E_SPEC_MANIFEST): { builtAt, specs:
// { spec -> files } }. Returns the specs map, or null so e2e falls back to a
// full run when the manifest is missing/unparseable.
function readE2eSpecFiles(): Record<string, string[]> | null {
  const path = process.env.E2E_SPEC_MANIFEST;
  if (path && existsSync(path)) {
    try {
      const { specs } = JSON.parse(readFileSync(path, "utf8"));
      if (specs && typeof specs === "object") {
        process.stderr.write(`Using e2e coverage manifest from ${path}.\n`);
        return specs;
      }
    } catch (error) {
      process.stderr.write(
        `Failed to read ${path}; e2e will run in full: ${error}\n`,
      );
    }
  } else {
    process.stderr.write("No E2E_SPEC_MANIFEST found; e2e will run in full.\n");
  }
  return null;
}

const testPlan = createTestPlan({
  elements,
  rules,
  changedFiles: csvToList(process.env.CHANGED_FILES),
  fileDependencies: readFileDependencies(),
  testFilesBySuite: {
    unit: listFiles(UNIT_ROOTS, UNIT_GLOBS),
    loki: listFiles(STORY_ROOTS, STORY_GLOBS),
    e2e: listSpecFiles(),
  },
  e2eSpecFiles: readE2eSpecFiles(),
  unitInfraTouched: process.env.UNIT_INFRA_TOUCHED === "true",
  lokiInfraTouched: process.env.LOKI_INFRA_TOUCHED === "true",
  e2eInfraTouched: process.env.E2E_INFRA_TOUCHED === "true",
  sharedSourcesTouched: process.env.SHARED_SOURCES_TOUCHED === "true",
  feFilesChanged: csvToList(process.env.FE_CHANGED_FILES).length,
  beFilesChanged: csvToList(process.env.BE_CHANGED_FILES).length,
  feFilesTotal: listFiles(["frontend", "enterprise/frontend"], ["**"]).length,
  beFilesTotal: listFiles(["src", "enterprise/backend"], ["**"]).length,
});

process.stdout.write(JSON.stringify(testPlan) + "\n");
