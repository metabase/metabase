import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// null means a full run; [] is an explicit selection of no tests.
function readSelection(planFile: string): string[] | null {
  const { fe_unit_specs_to_run: files, stats } = JSON.parse(
    readFileSync(planFile, "utf8"),
  );
  if (
    !Array.isArray(files) ||
    !files.every((file) => typeof file === "string" && file.length > 0) ||
    !Number.isInteger(stats?.unit_specs_all) ||
    stats.unit_specs_all < 0 ||
    files.length !== stats.unit_specs_to_run_usage ||
    files.length > stats.unit_specs_all
  ) {
    throw new Error("Invalid unit test selection");
  }
  return files.length === stats.unit_specs_all ? null : files;
}

export function prepareUnitTestSelection(env: NodeJS.ProcessEnv = process.env) {
  const { RUNNER_TEMP, GITHUB_OUTPUT, PLAN_DOWNLOADED } = env;
  if (!RUNNER_TEMP || !GITHUB_OUTPUT) {
    throw new Error("RUNNER_TEMP and GITHUB_OUTPUT are required");
  }

  let files: string[] | null;
  try {
    if (PLAN_DOWNLOADED !== "success") {
      throw new Error("Test plan download failed");
    }
    files = readSelection(join(RUNNER_TEMP, "test-plan/test-plan.json"));
  } catch {
    console.warn(
      "::warning::Test plan unavailable or invalid; running the full unit suite.",
    );
    return;
  }

  // Full selections use Jest's normal discovery, without the filter.
  if (files === null) {
    return;
  }

  const pathsFile = join(RUNNER_TEMP, "unit-specs.json");
  writeFileSync(pathsFile, JSON.stringify(files));
  appendFileSync(GITHUB_OUTPUT, `paths-file=${pathsFile}\n`);
}

if (require.main === module) {
  prepareUnitTestSelection();
}
