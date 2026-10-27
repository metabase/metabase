// What a spec file did, in the form the pool passes on, and the console output
// of each test.
import { format } from "node:util";

import type { FileResult, SnapshotSummary, TestIdentity } from "../types.ts";

import { projectFrames } from "./transform.ts";

const OUTPUT_LIMIT_CHARACTERS = 20000;
const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug"] as const;

type TestOutput = { lines: string[]; size: number };

let fileResult = createFileResult();
let testOutput: TestOutput | null = null;

/**
 * The result of the file that just ran. The next file starts a new one.
 */
export function takeFileResult(): FileResult {
  const result = fileResult;
  fileResult = createFileResult();
  return result;
}

/**
 * Keeps the console output of the running test, to show only if that test
 * fails, so a passing run prints nothing. A spec that spies on the console
 * wraps these functions and still sees every call.
 */
export function captureConsole(): void {
  for (const method of CONSOLE_METHODS) {
    console[method] = (...args: unknown[]) => {
      if (testOutput === null || testOutput.size > OUTPUT_LIMIT_CHARACTERS) {
        return;
      }
      const text = format(...args);
      testOutput.size += text.length;
      testOutput.lines.push(`console.${method}: ${text}`);
    };
  }
}

export function startTestOutput(): void {
  testOutput = { lines: [], size: 0 };
}

export function takeTestOutput(): string {
  const output = testOutput?.lines.join("\n") ?? "";
  testOutput = null;
  return output;
}

export function recordPassed(identity: TestIdentity): void {
  fileResult.passed += 1;
  fileResult.passedTests.push(identity);
}

export function recordSnapshots(snapshot: SnapshotSummary): void {
  fileResult.snapshot = snapshot;
}

export function recordSkipped(tests: TestIdentity[]): void {
  fileResult.skipped += tests.length;
  fileResult.skippedTests.push(...tests);
}

/**
 * Records a failed test, or with no identity a failure of the file itself,
 * such as one that did not load.
 */
export function recordFailure(
  test: string,
  error: unknown,
  output: string,
  identity?: TestIdentity,
): void {
  const { message, stack } = describeError(error);
  fileResult.failed += 1;
  fileResult.failures.push({
    test,
    identity,
    message,
    stack,
    frames: projectFrames(stack),
    output,
  });
}

/**
 * Turns a test that was recorded as passed into a failure.
 */
export function recordLateFailure(
  test: string,
  error: unknown,
  identity: TestIdentity,
): void {
  const index = fileResult.passedTests.indexOf(identity);
  if (index === -1) {
    return;
  }
  fileResult.passedTests.splice(index, 1);
  fileResult.passed -= 1;
  recordFailure(test, error, "", identity);
}

/**
 * The message and stack of anything thrown. An error from the jsdom window
 * belongs to another realm and is not an instance of this realm's Error, so
 * the fields are read by name.
 */
export function describeError(error: unknown): {
  message: string;
  stack: string;
} {
  if (typeof error !== "object" || error === null) {
    return { message: String(error), stack: "" };
  }
  const message =
    "message" in error && error.message != null
      ? String(error.message)
      : String(error);
  const stack =
    "stack" in error && typeof error.stack === "string" ? error.stack : "";
  return { message, stack };
}

function createFileResult(): FileResult {
  return {
    passed: 0,
    failed: 0,
    skipped: 0,
    passedTests: [],
    skippedTests: [],
    failures: [],
  };
}
