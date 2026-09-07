// I/O entrypoint: gather inputs (env vars, the test-file lists, the cruise graph on request),
// hand them to createTestPlan, which does the computing, and write its GITHUB_OUTPUT entries.

import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";

import micromatch from "micromatch";

import { MAIN_APP_STORY_GLOBS } from "../../.storybook/story-files.cjs";
import { elements, rules } from "../../frontend/lint/module-boundaries.mjs";

import { type FileDependency, parseCruiseModules } from "./affected-modules";
import { createTestPlan } from "./affected-tests";
import { listSpecFiles } from "./e2e-spec-globs.mjs";

// The specs `bun run test-unit` runs.
const UNIT_ROOTS = ["."];
const UNIT_GLOBS = [
  "**/*.unit.spec.{js,jsx,ts,tsx}",
  "!.github/**", // the ci-scripts project, which test-unit ignores
  "!release/**", // has its own jest config
  "!enterprise/frontend/src/custom-viz/**", // modulePathIgnorePatterns in jest.config.js
];

const STORY_ROOTS = ["frontend", "enterprise/frontend"];

// `git ls-files -- frontend enterprise/frontend` already prints just over a
// megabyte of paths, and node's default maxBuffer is exactly 1 MiB: past that
// the spawn dies with ENOBUFS. Give the listings room to grow.
const LS_FILES_MAX_BUFFER = 64 * 1024 * 1024;

// Returns the tracked files under `roots` that match `globs`. The `dot: true`
// option means files inside dot-directories such as `.storybook` are included.
function listFiles(roots: string[], globs: string[]): string[] {
  const tracked = execFileSync("git", ["ls-files", "-z", "--", ...roots], {
    encoding: "utf8",
    maxBuffer: LS_FILES_MAX_BUFFER,
  })
    .split("\0")
    .filter(Boolean);
  return micromatch(tracked, globs, { dot: true });
}

// dorny outputs comma-separated lists; CHANGED_FILES is `all_changed_files`.
const csvToList = (csv: string | undefined) =>
  (csv ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

// Runs dependency-cruiser over the frontend sources and parses its edges.
// Null falls back to the rules graph, so a failed cruise never breaks the plan.
function loadFileDependencies(): FileDependency[] | null {
  const output = "dependency-graph.json";
  process.stderr.write("Building usage graph with dependency-cruiser.\n");
  try {
    // stdout is the plan JSON, so the cruise's own output goes to stderr.
    const result = spawnSync(
      "bunx",
      [
        "depcruise",
        "frontend/src",
        "enterprise/frontend/src",
        "--config",
        ".dependency-cruiser.cjs",
        "--output-type",
        "json",
        "--output-to",
        output,
      ],
      { stdio: ["ignore", 2, 2] },
    );
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(`depcruise exited with status ${result.status}`);
    }
    const { modules } = JSON.parse(readFileSync(output, "utf8"));
    return parseCruiseModules(modules);
  } catch (error) {
    process.stderr.write(
      `Failed to build usage graph; falling back to rules graph: ${error}\n`,
    );
    return null;
  }
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
  loadFileDependencies,
  testFilesBySuite: {
    unit: listFiles(UNIT_ROOTS, UNIT_GLOBS),
    loki: listFiles(STORY_ROOTS, MAIN_APP_STORY_GLOBS),
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

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(testPlan)
      .map(([name, value]) => `${name}=${JSON.stringify(value)}\n`)
      .join(""),
  );
}
