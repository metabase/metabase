import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const TEST_UNIT_COMMAND = ["bun", "run", "test-unit-keep-cljs"];

type SuiteResult = {
  name: string;
  status: string;
  assertionResults: unknown[];
};

type JestResults = {
  wasInterrupted: boolean;
  testResults: SuiteResult[];
};

function isSuiteResult(value: unknown): value is SuiteResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof value.name === "string" &&
    "status" in value &&
    typeof value.status === "string" &&
    "assertionResults" in value &&
    Array.isArray(value.assertionResults)
  );
}

function readResults(file: string): JestResults | null {
  const value = readJson(file);
  if (
    typeof value === "object" &&
    value !== null &&
    "wasInterrupted" in value &&
    typeof value.wasInterrupted === "boolean" &&
    "testResults" in value &&
    Array.isArray(value.testResults) &&
    value.testResults.every(isSuiteResult)
  ) {
    return {
      wasInterrupted: value.wasInterrupted,
      testResults: value.testResults,
    };
  }
  return null;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readJson(file: string): unknown {
  try {
    return parseJson(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function hasContent(file: string): boolean {
  try {
    return statSync(file).size > 0;
  } catch {
    return false;
  }
}

export function findRunnerFailure(env: NodeJS.ProcessEnv): string | null {
  const {
    UNIT_TEST_RESULTS_FILE,
    JEST_JUNIT_OUTPUT_DIR,
    JEST_JUNIT_OUTPUT_NAME,
  } = env;
  if (
    !UNIT_TEST_RESULTS_FILE ||
    !JEST_JUNIT_OUTPUT_DIR ||
    !JEST_JUNIT_OUTPUT_NAME
  ) {
    throw new Error(
      "UNIT_TEST_RESULTS_FILE, JEST_JUNIT_OUTPUT_DIR and JEST_JUNIT_OUTPUT_NAME are required",
    );
  }

  const results = readResults(UNIT_TEST_RESULTS_FILE);
  if (results === null || results.wasInterrupted) {
    return "Jest did not finish the run.";
  }
  if (!hasContent(join(JEST_JUNIT_OUTPUT_DIR, JEST_JUNIT_OUTPUT_NAME))) {
    return "Jest did not write a JUnit report.";
  }

  const failedSuites = results.testResults.filter(
    (suite) => suite.status === "failed",
  );
  // jest-junit leaves out suites with no test results, so the quarantine gate never sees them.
  const suitesWithoutResults = failedSuites.filter(
    (suite) => suite.assertionResults.length === 0,
  );
  if (suitesWithoutResults.length > 0) {
    const names = suitesWithoutResults.map((suite) => suite.name).join(", ");
    return `Test suites failed to run: ${names}`;
  }
  if (failedSuites.length === 0) {
    return "Jest failed without a failing test suite.";
  }
  return null;
}

function listTests(
  command: readonly string[],
  env: NodeJS.ProcessEnv,
): string[] | null {
  const [program, ...args] = command;
  const result = spawnSync(program, [...args, "--listTests", "--json"], {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  if (result.status !== 0) {
    return null;
  }
  const listed = parseJson(result.stdout);
  return isStringArray(listed) ? listed : null;
}

// --passWithNoTests lets every shard pass when the selection matches nothing Jest discovers.
// A single empty shard is normal, so only an unsharded listing that is also empty warns.
export function findEmptySelection(
  env: NodeJS.ProcessEnv,
  command: readonly string[] = TEST_UNIT_COMMAND,
): string | null {
  const { UNIT_TEST_RESULTS_FILE, JEST_TEST_PATHS_FILE } = env;
  if (!UNIT_TEST_RESULTS_FILE || !JEST_TEST_PATHS_FILE) {
    return null;
  }
  const results = readResults(UNIT_TEST_RESULTS_FILE);
  const selection = readJson(JEST_TEST_PATHS_FILE);
  if (
    results === null ||
    results.testResults.length > 0 ||
    !isStringArray(selection) ||
    selection.length === 0
  ) {
    return null;
  }

  const listed = listTests(command, env);
  if (listed === null) {
    return "Could not list Jest's unit tests to check the selection.";
  }
  if (listed.length > 0) {
    return null;
  }
  return `None of the ${selection.length} selected unit specs match a test Jest discovers, so no unit tests ran.`;
}

if (require.main === module) {
  if (process.env.TEST_OUTCOME === "failure") {
    const failure = findRunnerFailure(process.env);
    if (failure !== null) {
      console.error(`::error::${failure}`);
      process.exitCode = 1;
    }
  } else {
    const warning = findEmptySelection(process.env);
    if (warning !== null) {
      console.warn(`::warning::${warning}`);
    }
  }
}
