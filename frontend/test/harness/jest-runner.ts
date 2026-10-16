// A jest runner that runs the selected spec files in the harness's pool. jest
// keeps its command line, its test selection and its reporters, and gets one
// TestResult per file.
import { createRequire } from "node:module";
import path from "node:path";

import { root } from "./jest-config.ts";
import { createPool } from "./pool.ts";
import type {
  FileDone,
  SourceFrame,
  TestFailure,
  TestIdentity,
} from "./types.ts";

// The parts of jest's types that this runner reads and writes. jest's own
// packages do not resolve from the repository.
type GlobalConfig = {
  rootDir: string;
  maxWorkers: number;
  testNamePattern?: string;
  updateSnapshot: "all" | "new" | "none";
  collectCoverage: boolean;
  noStackTrace: boolean;
};

type ProjectConfig = {
  rootDir: string;
  testMatch: string[];
  slowTestThreshold?: number;
};

type Test = {
  path: string;
  context: { config: ProjectConfig };
};

type Watcher = {
  isInterrupted(): boolean;
};

type AssertionResult = {
  ancestorTitles: string[];
  title: string;
  fullName: string;
  status: "passed" | "failed" | "pending";
  failureMessages: string[];
  failureDetails: unknown[];
  numPassingAsserts: number;
  duration?: number;
  location?: null;
};

type SerializableError = {
  message: string;
  stack?: string;
};

type TestResult = {
  testFilePath: string;
  numPassingTests: number;
  numFailingTests: number;
  numPendingTests: number;
  numTodoTests: number;
  failureMessage: string | null;
  testExecError?: SerializableError;
  testResults: AssertionResult[];
  perfStats: {
    start: number;
    end: number;
    runtime: number;
    slow: boolean;
    loadTestEnvironmentStart: number;
    loadTestEnvironmentEnd: number;
    setupFilesStart: number;
    setupFilesEnd: number;
    setupAfterEnvStart: number;
    setupAfterEnvEnd: number;
  };
  snapshot: {
    added: number;
    fileDeleted: boolean;
    matched: number;
    unchecked: number;
    uncheckedKeys: string[];
    unmatched: number;
    updated: number;
  };
  skipped: boolean;
  leaks: boolean;
  openHandles: Error[];
};

type FormatResultsErrors = (
  testResults: AssertionResult[],
  config: ProjectConfig,
  options: { noStackTrace: boolean },
  testPath: string,
) => string | null;

type OnTestStart = (test: Test) => Promise<void>;
type OnTestSuccess = (test: Test, result: TestResult) => Promise<void>;
type OnTestFailure = (test: Test, error: SerializableError) => Promise<void>;

const DEFAULT_SLOW_TEST_THRESHOLD_S = 5;

// jest formats a file's failures with jest-message-util, which is not a
// dependency of the repository, so it is loaded from where jest loads it.
const requireFromJestCore = createRequire(
  createRequire(import.meta.url).resolve("@jest/core", {
    paths: [path.dirname(createRequire(import.meta.url).resolve("jest"))],
  }),
);
const { formatResultsErrors }: { formatResultsErrors: FormatResultsErrors } =
  requireFromJestCore("jest-message-util");
const RUNNER_FRAME = new RegExp(
  `^\\s+at .*(node:internal/|${import.meta.dirname}/)`,
);
const STACK_POSITION = /((?:\/|[A-Za-z]:\\)[^():]+):(\d+):(\d+)(?=\)?$)/;
const NO_SNAPSHOTS: TestResult["snapshot"] = {
  added: 0,
  fileDeleted: false,
  matched: 0,
  unchecked: 0,
  uncheckedKeys: [],
  unmatched: 0,
  updated: 0,
};

export default class HarnessRunner {
  readonly supportsEventEmitters = false;
  readonly #globalConfig: GlobalConfig;

  constructor(globalConfig: GlobalConfig) {
    this.#globalConfig = globalConfig;
  }

  async runTests(
    tests: Test[],
    watcher: Watcher,
    onStart: OnTestStart,
    onResult: OnTestSuccess,
    onFailure: OnTestFailure,
  ): Promise<void> {
    if (this.#globalConfig.collectCoverage) {
      throw new Error("The node:test runner does not collect coverage");
    }
    const testsByFile = new Map(tests.map((test) => [test.path, test]));
    const startedAt = new Map<string, number>();
    const callbacks: Promise<void>[] = [];

    const pool = createPool({
      workers: this.#globalConfig.maxWorkers,
      env: this.#workerEnvironment(),
      onFileStart: ({ file }) => {
        startedAt.set(file, Date.now());
        callbacks.push(onStart(testOf(testsByFile, file)));
      },
      onFileDone: (done) => {
        const test = testOf(testsByFile, done.file);
        const start = startedAt.get(done.file) ?? Date.now() - done.durationMs;
        const brokenFile = fileError(done.result.failures);
        callbacks.push(
          brokenFile
            ? onFailure(test, brokenFile)
            : onResult(
                test,
                toTestResult(done, start, test, this.#globalConfig),
              ).catch((error) => onFailure(test, serializable(error))),
        );
        if (watcher.isInterrupted()) {
          pool.stop();
        }
      },
    });
    try {
      await pool.run([...testsByFile.keys()]);
    } finally {
      pool.close();
    }
    await Promise.all(callbacks);
  }

  #workerEnvironment(): NodeJS.ProcessEnv {
    const { testNamePattern, updateSnapshot } = this.#globalConfig;
    return {
      ...(updateSnapshot === "all" && { NT_UPDATE_SNAPSHOTS: "1" }),
      ...(testNamePattern && { NT_TEST_NAME_PATTERN: testNamePattern }),
      ...(process.stdout.isTTY && { FORCE_COLOR: "1" }),
    };
  }
}

function testOf(testsByFile: Map<string, Test>, file: string): Test {
  const test = testsByFile.get(file);
  if (!test) {
    throw new Error(`The pool ran a file that jest did not select: ${file}`);
  }
  return test;
}

/**
 * The failure of the file itself, such as one that did not load, which jest
 * reports in place of the file's tests.
 */
function fileError(failures: TestFailure[]): SerializableError | null {
  const broken = failures.filter((failure) => !failure.identity);
  if (broken.length === 0) {
    return null;
  }
  return {
    message: broken.map((failure) => failure.message).join("\n"),
    stack: broken.map((failure) => stackOf(failure)).join("\n"),
  };
}

function toTestResult(
  done: FileDone,
  start: number,
  test: Test,
  globalConfig: GlobalConfig,
): TestResult {
  const { result } = done;
  const failed = result.failures.filter((failure) => failure.identity);
  const testResults = [
    ...result.passedTests.map((identity) => assertion(identity, "passed")),
    ...result.skippedTests.map((identity) => assertion(identity, "pending")),
    ...failed.map((failure) =>
      assertion(failure.identity as TestIdentity, "failed", failure),
    ),
  ];
  const runtime = done.durationMs;
  const slowThreshold =
    test.context.config.slowTestThreshold ?? DEFAULT_SLOW_TEST_THRESHOLD_S;
  return {
    testFilePath: done.file,
    numPassingTests: result.passed,
    numFailingTests: result.failed,
    numPendingTests: result.skipped,
    numTodoTests: 0,
    failureMessage: formatResultsErrors(
      testResults,
      test.context.config,
      { noStackTrace: globalConfig.noStackTrace },
      done.file,
    ),
    testResults,
    perfStats: {
      start,
      end: start + runtime,
      runtime,
      slow: runtime / 1000 > slowThreshold,
      loadTestEnvironmentStart: start,
      loadTestEnvironmentEnd: start,
      setupFilesStart: start,
      setupFilesEnd: start,
      setupAfterEnvStart: start,
      setupAfterEnvEnd: start,
    },
    snapshot: result.snapshot ?? NO_SNAPSHOTS,
    skipped: result.passed + result.failed === 0,
    leaks: false,
    openHandles: [],
  };
}

function assertion(
  identity: TestIdentity,
  status: AssertionResult["status"],
  failure?: TestFailure,
): AssertionResult {
  return {
    ancestorTitles: identity.ancestors,
    title: identity.title,
    fullName: [...identity.ancestors, identity.title].join(" "),
    status,
    failureMessages: failure
      ? [stackOf(failure) || failure.message]
      : [],
    failureDetails: [],
    numPassingAsserts: 0,
    location: null,
  };
}

/**
 * The stack as jest would show it: without the frames of the runner and of
 * node:test, and with the project's frames at their lines in the source as
 * written, which the worker has mapped.
 */
function stackOf({ stack, frames }: TestFailure): string {
  const mapped = [...frames];
  return stack
    .split("\n")
    .filter((line) => !RUNNER_FRAME.test(line))
    .map((line) => {
      const match = line.match(STACK_POSITION);
      const frame = match && isFrameOf(mapped[0], match[1]) && mapped.shift();
      return frame
        ? line.replace(
            STACK_POSITION,
            `${path.join(root, frame.file)}:${frame.line}:${frame.column}`,
          )
        : line;
    })
    .join("\n");
}

function isFrameOf(frame: SourceFrame | undefined, file: string): boolean {
  return frame !== undefined && path.join(root, frame.file) === file;
}

function serializable(error: unknown): SerializableError {
  return error instanceof Error
    ? { message: error.message, stack: error.stack }
    : { message: String(error) };
}
