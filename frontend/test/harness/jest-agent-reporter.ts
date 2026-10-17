// A jest reporter for agents and pipes: no colour, no progress, fixed line
// prefixes, and a limit on how much a failure may print. Each failure also goes
// to a detail file of its own, in full. It reads jest's results, so it works
// with either runner.
import fs from "node:fs";
import path from "node:path";

import { isProjectSource, root } from "./jest-config.ts";
import type { ConsoleOutputDetail, SourceFrame } from "./types.ts";

// The parts of jest's types that this reporter reads.
type GlobalConfig = {
  testPathPatterns: { patterns: string[] };
};

type AssertionResult = {
  ancestorTitles: string[];
  title: string;
  status: string;
  failureMessages: string[];
  failureDetails: unknown[];
};

type TestResult = {
  testFilePath: string;
  numPassingTests: number;
  numFailingTests: number;
  numPendingTests: number;
  numTodoTests: number;
  testExecError?: { message: string; stack?: string };
  testResults: AssertionResult[];
};

type Failure = {
  test: string;
  message: string;
  stack: string;
  frames: SourceFrame[];
  output: string;
};

const DETAIL_DIRECTORY = path.join(
  root,
  "node_modules/.cache/test-harness/last-run",
);
const ESCAPE = String.fromCharCode(27);
const ANSI = new RegExp(`${ESCAPE}\\[[0-9;]*m`, "g");
const STACK_FRAME = /\(?((?:\/|[A-Za-z]:\\)[^():]+):(\d+):(\d+)\)?$/;
const STACK_LINE = /^\s+at /;
const MAX_FRAMES = 5;
const FULL_FAILURES = 10;
const MESSAGE_LINES = 30;
const SHORT_MESSAGE_LENGTH = 160;
// The message of a plain Error is shown without its name.
const PLAIN_ERROR_PREFIX = /^Error: /;
// A message from Testing Library carries the whole rendered page after its
// first paragraph. That part stays in the detail file.
const RENDERED_PAGE = /\n\s*\n(?=Ignored nodes:|<body|\s*<)/;

// eslint-disable-next-line import/no-default-export -- jest loads a reporter from its default export
export default class AgentReporter {
  readonly #patterns: string[];
  #totals = { files: 0, passed: 0, failed: 0, skipped: 0 };
  #failedFiles: string[] = [];
  #failuresShown = 0;
  #detailFiles = 0;
  #startedAt = 0;

  constructor(globalConfig: GlobalConfig) {
    this.#patterns = globalConfig.testPathPatterns.patterns;
  }

  onRunStart(): void {
    this.#totals = { files: 0, passed: 0, failed: 0, skipped: 0 };
    this.#failedFiles = [];
    this.#failuresShown = 0;
    this.#detailFiles = 0;
    this.#startedAt = Date.now();
    fs.rmSync(DETAIL_DIRECTORY, { recursive: true, force: true });
    fs.mkdirSync(DETAIL_DIRECTORY, { recursive: true });
  }

  onTestResult(_test: unknown, testResult: TestResult): void {
    const file = path.relative(root, testResult.testFilePath);
    const failures = failuresOf(testResult);
    this.#totals.files += 1;
    this.#totals.passed += testResult.numPassingTests;
    this.#totals.failed += failures.length;
    this.#totals.skipped +=
      testResult.numPendingTests + testResult.numTodoTests;
    if (failures.length > 0) {
      this.#failedFiles.push(file);
    }
    for (const failure of failures) {
      this.#printFailure(file, failure);
    }
  }

  onRunComplete(): void {
    const { files, passed, failed, skipped } = this.#totals;
    const seconds = Math.round((Date.now() - this.#startedAt) / 1000);
    process.stdout.write(
      `SUMMARY files=${files} passed=${passed} failed=${failed} skipped=${skipped} seconds=${seconds}\n`,
    );
    if (this.#failedFiles.length > 0) {
      process.stdout.write(`RERUN ${this.#rerunCommand(this.#failedFiles)}\n`);
    }
  }

  getLastError(): undefined {
    return undefined;
  }

  #printFailure(file: string, failure: Failure): void {
    const detail = path.relative(
      process.cwd(),
      this.#writeDetail(file, failure),
    );
    const [frame] = failure.frames;
    const where = frame ? `${frame.file}:${frame.line}` : file;
    const message = plain(failure.message);
    this.#failuresShown += 1;
    if (this.#failuresShown > FULL_FAILURES) {
      const firstLine = message.split("\n")[0].slice(0, SHORT_MESSAGE_LENGTH);
      process.stdout.write(
        `FAIL ${where} > ${failure.test} | ${firstLine} | ${detail}\n`,
      );
      return;
    }
    const shown = firstLines(message.split(RENDERED_PAGE)[0].trim());
    process.stdout.write(`FAIL ${where} > ${failure.test}\n`);
    process.stdout.write(`${indent(shown)}\n`);
    process.stdout.write(`  detail: ${detail}\n`);
  }

  #writeDetail(file: string, failure: Failure): string {
    this.#detailFiles += 1;
    const target = path.join(
      DETAIL_DIRECTORY,
      `${String(this.#detailFiles).padStart(3, "0")}.txt`,
    );
    const parts = [
      `${file} > ${failure.test}`,
      "",
      plain(failure.message),
      "",
      plain(failure.stack),
    ];
    if (failure.output) {
      parts.push("", "Console output:", failure.output);
    }
    fs.writeFileSync(target, `${parts.join("\n")}\n`);
    return target;
  }

  // The same script, or the same jest command, with the failed files in place
  // of the patterns.
  #rerunCommand(files: string[]): string {
    const script = process.env.npm_lifecycle_event;
    if (script) {
      return `bun run ${script} ${files.join(" ")}`;
    }
    const [, jest, ...rest] = process.argv;
    const options = rest.filter((arg) => !this.#patterns.includes(arg));
    return [path.relative(process.cwd(), jest), ...files, ...options].join(" ");
  }
}

function failuresOf(testResult: TestResult): Failure[] {
  const { testExecError } = testResult;
  if (testExecError) {
    return [
      failureOf(
        "(the file did not load)",
        testExecError.stack ?? testExecError.message,
      ),
    ];
  }
  return testResult.testResults
    .filter((assertion) => assertion.status === "failed")
    .map((assertion) =>
      failureOf(
        [...assertion.ancestorTitles, assertion.title].join(" > "),
        assertion.failureMessages.join("\n"),
        consoleOutputOf(assertion.failureDetails),
      ),
    );
}

function failureOf(test: string, stack: string, output = ""): Failure {
  const lines = stack.split("\n");
  const firstFrame = lines.findIndex((line) => STACK_LINE.test(line));
  const message = (
    firstFrame === -1 ? stack : lines.slice(0, firstFrame).join("\n")
  ).replace(PLAIN_ERROR_PREFIX, "");
  return { test, message, stack, frames: projectFrames(lines), output };
}

// Only the node:test runner gives a test's console output. jest's own runner
// prints it as the test runs.
function consoleOutputOf(failureDetails: unknown[]): string {
  return failureDetails
    .filter(isConsoleOutputDetail)
    .map((detail) => detail.consoleOutput)
    .join("\n");
}

function isConsoleOutputDetail(detail: unknown): detail is ConsoleOutputDetail {
  return (
    typeof detail === "object" &&
    detail !== null &&
    "consoleOutput" in detail &&
    typeof detail.consoleOutput === "string"
  );
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

function plain(text: string): string {
  return text.replace(ANSI, "");
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => (line === "" ? line : `  ${line}`))
    .join("\n");
}

function firstLines(text: string): string {
  const lines = text.split("\n");
  if (lines.length <= MESSAGE_LINES) {
    return text;
  }
  return `${lines.slice(0, MESSAGE_LINES).join("\n")}\n... ${lines.length - MESSAGE_LINES} more lines`;
}
