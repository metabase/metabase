// A jest reporter that prints the runner's output for agents: FAIL lines with
// a short message and a detail file, a SUMMARY line and a RERUN command. It
// reads jest's results, so it works with either runner.
import path from "node:path";

import { isProjectSource, root } from "./jest-config.ts";
import { type Reporter, createReporter } from "./reporters.ts";
import type {
  FileDone,
  SourceFrame,
  TestFailure,
  TestIdentity,
} from "./types.ts";

// The parts of jest's types that this reporter reads.
type GlobalConfig = {
  testPathPatterns: { patterns: string[] };
};

type AssertionResult = {
  ancestorTitles: string[];
  title: string;
  status: string;
  failureMessages: string[];
};

type TestResult = {
  testFilePath: string;
  numPassingTests: number;
  numFailingTests: number;
  numPendingTests: number;
  numTodoTests: number;
  perfStats: { runtime: number };
  testExecError?: { message: string; stack?: string };
  testResults: AssertionResult[];
};

const CACHE_DIRECTORY = path.join(root, "node_modules/.cache/test-harness");
const STACK_FRAME = /\(?((?:\/|[A-Za-z]:\\)[^():]+):(\d+):(\d+)\)?$/;
const STACK_LINE = /^\s+at /;
const MAX_FRAMES = 5;
// The runner shows the message of an Error without its name.
const PLAIN_ERROR_PREFIX = /^Error: /;

export default class AgentReporter {
  readonly #reporter: Reporter;
  readonly #patterns: string[];

  constructor(globalConfig: GlobalConfig) {
    this.#patterns = globalConfig.testPathPatterns.patterns;
    this.#reporter = createReporter("agent", {
      root,
      stream: process.stdout,
      workers: 1,
      estimate: () => 0,
      detailDirectory: path.join(CACHE_DIRECTORY, "last-run"),
      rerunCommand: (files) => this.#rerunCommand(files),
    });
  }

  onRunStart(): void {
    this.#reporter.start([]);
  }

  onTestResult(_test: unknown, testResult: TestResult): void {
    this.#reporter.fileDone(toFileDone(testResult));
  }

  onRunComplete(): void {
    this.#reporter.finish();
  }

  getLastError(): undefined {
    return undefined;
  }

  // The same jest command with the failed files in place of the patterns.
  #rerunCommand(files: string[]): string {
    const [, jest, ...rest] = process.argv;
    const options = rest.filter((arg) => !this.#patterns.includes(arg));
    return [path.relative(process.cwd(), jest), ...files, ...options].join(" ");
  }
}

function toFileDone(testResult: TestResult): FileDone {
  const file = testResult.testFilePath;
  const { testExecError } = testResult;
  const failures = testExecError
    ? [
        failureOf(
          "(the file did not load)",
          testExecError.stack ?? testExecError.message,
        ),
      ]
    : testResult.testResults
        .filter((assertion) => assertion.status === "failed")
        .map((assertion) =>
          failureOf(
            [...assertion.ancestorTitles, assertion.title].join(" > "),
            assertion.failureMessages.join("\n"),
            { ancestors: assertion.ancestorTitles, title: assertion.title },
          ),
        );
  return {
    file,
    durationMs: testResult.perfStats.runtime,
    loaded: [],
    result: {
      passed: testResult.numPassingTests,
      failed: testExecError ? 1 : testResult.numFailingTests,
      skipped: testResult.numPendingTests + testResult.numTodoTests,
      passedTests: [],
      skippedTests: [],
      failures,
    },
  };
}

function failureOf(
  test: string,
  stack: string,
  identity?: TestIdentity,
): TestFailure {
  const lines = stack.split("\n");
  const firstFrame = lines.findIndex((line) => STACK_LINE.test(line));
  const message = (
    firstFrame === -1 ? stack : lines.slice(0, firstFrame).join("\n")
  ).replace(PLAIN_ERROR_PREFIX, "");
  return {
    test,
    identity,
    message,
    stack,
    frames: projectFrames(lines),
    output: "",
  };
}

function projectFrames(lines: string[]): SourceFrame[] {
  return lines
    .filter((line) => STACK_LINE.test(line))
    .flatMap((line) => {
      const match = line.match(STACK_FRAME);
      if (!match) {
        return [];
      }
      const file = path.resolve(root, match[1]);
      return isProjectSource(file)
        ? [
            {
              file: path.relative(root, file),
              line: Number(match[2]),
              column: Number(match[3]),
            },
          ]
        : [];
    })
    .slice(0, MAX_FRAMES);
}
