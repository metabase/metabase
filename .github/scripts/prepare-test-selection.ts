import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { TestPlan, TestPlanStats } from "./affected-tests";

type NumberStat = {
  [K in keyof TestPlanStats]: TestPlanStats[K] extends number ? K : never;
}[keyof TestPlanStats];

type Suite = {
  name: string;
  filesKey: Exclude<keyof TestPlan, "stats">;
  totalKey: NumberStat;
  selectedKey: NumberStat;
  pathsFile: string;
};

export const SUITES = {
  unit: {
    name: "unit",
    filesKey: "fe_unit_specs_to_run",
    totalKey: "unit_specs_all",
    selectedKey: "unit_specs_to_run_usage",
    pathsFile: "unit-specs.json",
  },
  loki: {
    name: "Loki",
    filesKey: "loki_stories_to_run",
    totalKey: "loki_stories_all",
    selectedKey: "loki_stories_to_run_usage",
    pathsFile: "loki-stories.json",
  },
  e2e: {
    name: "E2E",
    filesKey: "e2e_specs_to_run",
    totalKey: "e2e_specs_all",
    selectedKey: "e2e_specs_to_run_usage",
    pathsFile: "e2e-specs.json",
  },
} satisfies Record<string, Suite>;

function isSuiteName(name: string): name is keyof typeof SUITES {
  return Object.hasOwn(SUITES, name);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

// null means a full run, and [] is an explicit selection of no tests.
function readSelection(planFile: string, suite: Suite): string[] | null {
  const plan: unknown = JSON.parse(readFileSync(planFile, "utf8"));
  const files = isRecord(plan) ? plan[suite.filesKey] : undefined;
  const stats = isRecord(plan) && isRecord(plan.stats) ? plan.stats : {};
  const total = stats[suite.totalKey];
  if (
    !isStringArray(files) ||
    files.some((file) => file.length === 0) ||
    !isCount(total) ||
    files.length !== stats[suite.selectedKey] ||
    files.length > total
  ) {
    throw new Error(`Invalid ${suite.name} test selection`);
  }
  return files.length === total ? null : files;
}

export function prepareTestSelection(
  suiteName: keyof typeof SUITES,
  env: NodeJS.ProcessEnv = process.env,
) {
  const suite: Suite = SUITES[suiteName];
  const { RUNNER_TEMP, GITHUB_OUTPUT, PLAN_DOWNLOADED } = env;
  if (!RUNNER_TEMP || !GITHUB_OUTPUT) {
    throw new Error("RUNNER_TEMP and GITHUB_OUTPUT are required");
  }

  let files: string[] | null;
  try {
    if (PLAN_DOWNLOADED !== "success") {
      throw new Error("Test plan download failed");
    }
    files = readSelection(join(RUNNER_TEMP, "test-plan/test-plan.json"), suite);
  } catch (error) {
    console.warn(
      `::warning::Test plan unavailable or invalid, running the full ${suite.name} suite: ${error}`,
    );
    return;
  }

  if (files === null) {
    appendFileSync(GITHUB_OUTPUT, "selection=full\n");
    return;
  }

  const pathsFile = join(RUNNER_TEMP, suite.pathsFile);
  writeFileSync(pathsFile, JSON.stringify(files));
  appendFileSync(
    GITHUB_OUTPUT,
    `paths-file=${pathsFile}\nselection=${files.length === 0 ? "empty" : "narrowed"}\n`,
  );
}

if (require.main === module) {
  const suiteName = process.argv[2] ?? "";
  if (!isSuiteName(suiteName)) {
    throw new Error(
      `Unknown test suite "${suiteName}", expected one of: ${Object.keys(SUITES).join(", ")}`,
    );
  }
  prepareTestSelection(suiteName);
}
