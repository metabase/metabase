// A jest runner that runs the selected spec files in the harness's pool. jest
// keeps its command line, its test selection and its reporters, and gets one
// TestResult per file.
import { createRequire } from "node:module";
import path from "node:path";

import { root } from "./jest-config.ts";
import { createPool } from "./pool.ts";
import type {
  ConsoleOutputDetail,
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
  testTimeout: number;
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
  status: "passed" | "failed" | "pending" | "todo";
  failureMessages: string[];
  failureDetails: unknown[];
  numPassingAsserts: number;
  duration?: number;
  location?: null;
};

type ReportedTest = {
  identity: TestIdentity;
  status: AssertionResult["status"];
  failure?: TestFailure;
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

type FormatExecError = (
  error: SerializableError,
  config: ProjectConfig,
  options: { noStackTrace: boolean },
  testPath: string,
) => string;

type OnTestStart = (test: Test) => Promise<void>;
type OnTestSuccess = (test: Test, result: TestResult) => Promise<void>;
type OnTestFailure = (test: Test, error: SerializableError) => Promise<void>;

const DEFAULT_SLOW_TEST_THRESHOLD_S = 5;
// jest runs the files that failed last time first, then the slowest. On a
// large run that starts the heaviest files together in workers that have not
// warmed up, and path order is faster. On a smaller run jest's order is
// faster, because no slow file starts last.
const PATH_ORDER_MIN_FILES_PER_WORKER = 100;

// jest formats a file's failures with jest-message-util, which is not a
// dependency of the repository, so it is loaded from where jest loads it.
const requireFromJestCore = createRequire(
  createRequire(import.meta.url).resolve("@jest/core", {
    paths: [path.dirname(createRequire(import.meta.url).resolve("jest"))],
  }),
);
const {
  formatExecError,
  formatResultsErrors,
}: {
  formatExecError: FormatExecError;
  formatResultsErrors: FormatResultsErrors;
} = requireFromJestCore("jest-message-util");
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

// eslint-disable-next-line import/no-default-export -- jest loads a runner from its default export
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
      await pool.run(
        runOrder([...testsByFile.keys()], this.#globalConfig.maxWorkers),
      );
    } finally {
      pool.close();
    }
    await Promise.all(callbacks);
  }

  #workerEnvironment(): NodeJS.ProcessEnv {
    const { testNamePattern, testTimeout, updateSnapshot } = this.#globalConfig;
    return {
      NT_UPDATE_SNAPSHOTS: updateSnapshot,
      // jest's own value, which --testTimeout changes. A debug run that sets
      // NT_TIMEOUT keeps it.
      ...(process.env.NT_TIMEOUT === undefined && {
        NT_TIMEOUT: String(testTimeout),
      }),
      ...(testNamePattern && { NT_TEST_NAME_PATTERN: testNamePattern }),
      ...(process.stdout.isTTY && { FORCE_COLOR: "1" }),
    };
  }
}

function runOrder(files: string[], workers: number): string[] {
  return files.length > PATH_ORDER_MIN_FILES_PER_WORKER * workers
    ? [...files].sort()
    : files;
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

// jest-circus puts the errors of afterAll hooks in testExecError, next to the
// results of the file's tests.
function suiteError(errors: TestFailure[]): SerializableError | null {
  if (errors.length === 0) {
    return null;
  }
  return {
    message: errors.map((error) => error.message).join("\n"),
    stack: errors.map((error) => stackOf(error)).join("\n"),
  };
}

function toTestResult(
  done: FileDone,
  start: number,
  test: Test,
  globalConfig: GlobalConfig,
): TestResult {
  const { result } = done;
  const failed = result.failures.flatMap((failure) =>
    failure.identity ? [{ failure, identity: failure.identity }] : [],
  );
  const reported: ReportedTest[] = [
    ...result.passedTests.map(
      (identity): ReportedTest => ({ identity, status: "passed" }),
    ),
    ...result.skippedTests.map(
      (identity): ReportedTest => ({ identity, status: "pending" }),
    ),
    ...result.todoTests.map(
      (identity): ReportedTest => ({ identity, status: "todo" }),
    ),
    ...failed.map(
      ({ failure, identity }): ReportedTest => ({
        identity,
        status: "failed",
        failure,
      }),
    ),
  ];
  // jest lists a file's tests in the order in which they ran.
  const testResults = reported
    .sort((a, b) => orderOf(a.identity) - orderOf(b.identity))
    .map(({ identity, status, failure }) =>
      assertion(identity, status, failure),
    );
  const testExecError = suiteError(result.suiteErrors);
  const options = { noStackTrace: globalConfig.noStackTrace };
  const failureMessages = [
    formatResultsErrors(testResults, test.context.config, options, done.file),
    testExecError &&
      formatExecError(testExecError, test.context.config, options, done.file),
  ].filter((message) => message);
  const runtime = done.durationMs;
  const slowThreshold =
    test.context.config.slowTestThreshold ?? DEFAULT_SLOW_TEST_THRESHOLD_S;
  return {
    testFilePath: done.file,
    numPassingTests: result.passed,
    numFailingTests: result.failed,
    numPendingTests: result.skipped,
    numTodoTests: result.todo,
    failureMessage:
      failureMessages.length > 0 ? failureMessages.join("\n") : null,
    ...(testExecError && { testExecError }),
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
    skipped: result.passed + result.failed + result.todo === 0,
    leaks: false,
    openHandles: [],
  };
}

function orderOf(identity: TestIdentity): number {
  return identity.order ?? Number.MAX_SAFE_INTEGER;
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
    duration: identity.durationMs,
    failureMessages: failure ? [stackOf(failure) || failure.message] : [],
    failureDetails: failure?.output
      ? [consoleOutputDetail(failure.output)]
      : [],
    numPassingAsserts: 0,
    location: null,
  };
}

function consoleOutputDetail(consoleOutput: string): ConsoleOutputDetail {
  return { consoleOutput };
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
