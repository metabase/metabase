import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

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
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
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

if (require.main === module) {
  const failure = findRunnerFailure(process.env);
  if (failure !== null) {
    console.error(`::error::${failure}`);
    process.exitCode = 1;
  }
}
