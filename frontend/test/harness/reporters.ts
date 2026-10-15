// How a run is shown. One stream of results, three ways to print it: for a
// person at a terminal, for an agent or a pipe, and as JSON for a tool.
import fs from "node:fs";
import path from "node:path";

import type {
  FileDone,
  FileStarted,
  SourceFrame,
  TestFailure,
} from "./types.ts";

export type FailedTest = { file: string; test: string };

/**
 * What happened when each failed file ran once more, alone in a new worker.
 */
export type Confirmation = {
  files: number;
  passedAlone: FailedTest[];
  failedAgain: number;
};

export type Reporter = {
  start(files: string[]): void;
  fileStarted(started: FileStarted): void;
  fileDone(done: FileDone): void;
  failures(): FailedTest[];
  confirming(fileCount: number): void;
  /**
   * Prints the summary and returns the spec files that had a failed test.
   */
  finish(confirmation?: Confirmation): string[];
};

export type ReporterOptions = {
  root: string;
  stream: NodeJS.WriteStream;
  workers: number;
  estimate: (file: string) => number;
  detailDirectory: string;
  rerunCommand: (files: string[]) => string;
};

type Paint = (text: string) => string;
type Colors = Record<"red" | "green" | "yellow" | "dim" | "bold", Paint>;

const ESCAPE = String.fromCharCode(27);
const ANSI = new RegExp(`${ESCAPE}\\[[0-9;]*m`, "g");
const CLEAR_LINE = `\r${ESCAPE}[K`;
const SOURCE_FRAME_LINES = 2;
const MESSAGE_LINES_FOR_PEOPLE = 40;
const OUTPUT_LINES_FOR_PEOPLE = 15;
const FULL_FAILURES_FOR_AGENTS = 10;
const MESSAGE_LINES_FOR_AGENTS = 30;
const SHORT_MESSAGE_LENGTH = 160;
const STATUS_INTERVAL_MS = 250;
const SHOW_RUNNING_FILE_AFTER_MS = 3000;
const SLOWEST_FILES_SHOWN = 3;
const MIN_FILES_FOR_SLOWEST = 20;

const REPORTERS = {
  human: createHumanReporter,
  agent: createAgentReporter,
  json: createJsonReporter,
} satisfies Record<string, (options: ReporterOptions) => Reporter>;

export type ReporterName = keyof typeof REPORTERS;

export const reporterNames = Object.keys(REPORTERS);

export function isReporterName(name: string): name is ReporterName {
  return name in REPORTERS;
}

export function createReporter(
  name: ReporterName,
  options: ReporterOptions,
): Reporter {
  return REPORTERS[name](options);
}

// For a person at a terminal: one line that shows progress while the run goes
// on, each failure as it happens, and a short summary at the end.
function createHumanReporter({
  root,
  stream,
  workers,
  estimate,
  detailDirectory,
  rerunCommand,
}: ReporterOptions): Reporter {
  const isTerminal = stream.isTTY === true;
  const paint =
    (code: string): Paint =>
    (text) =>
      isTerminal ? `${ESCAPE}[${code}m${text}${ESCAPE}[0m` : text;
  const color: Colors = {
    red: paint("31"),
    green: paint("32"),
    yellow: paint("33"),
    dim: paint("2"),
    bold: paint("1"),
  };
  const relative = (file: string) => path.relative(root, file);
  const running = new Map<string, number>();
  let results = createResults();
  let startedAt = 0;
  let total = 0;
  let remainingMs = 0;
  let writeDetail = createDetailWriter(detailDirectory);
  let statusTimer: ReturnType<typeof setInterval> | undefined;

  const showStatus = () => {
    if (!isTerminal) {
      return;
    }
    const parts = [`${results.totals.files}/${total} files`];
    if (results.totals.failed > 0) {
      parts.push(color.red(`${results.totals.failed} failed`));
    }
    parts.push(`${clock((Date.now() - startedAt) / 1000)} elapsed`);
    if (remainingMs > 0 && results.totals.files < total) {
      parts.push(`about ${clock(remainingMs / 1000 / workers)} left`);
    }
    const longest = longestRunning(running);
    if (longest && Date.now() - longest.since > SHOW_RUNNING_FILE_AFTER_MS) {
      const seconds = Math.round((Date.now() - longest.since) / 1000);
      parts.push(
        color.dim(`running: ${path.basename(longest.file)} (${seconds} s)`),
      );
    }
    stream.write(`${CLEAR_LINE}${parts.join("   ")}`);
  };

  const clearStatus = () => {
    if (isTerminal) {
      stream.write(CLEAR_LINE);
    }
  };

  const printFailure = (file: string, failure: TestFailure) => {
    const detail = writeDetail(relative(file), failure);
    stream.write(`\n  ${color.red("●")} ${failure.test}\n\n`);
    // The message is the one jest's expect built, so a failed matcher reads
    // here as it does under jest, diff and all.
    const message = isTerminal ? failure.message : plain(failure.message);
    stream.write(
      `${indent(firstLines(message, MESSAGE_LINES_FOR_PEOPLE), 4)}\n`,
    );
    const [frame] = failure.frames;
    if (frame) {
      const source = sourceAround(root, frame, color);
      if (source) {
        stream.write(`\n${indent(source, 4)}\n`);
      }
      const frames = failure.frames.map((entry) =>
        color.dim(`      at ${entry.file}:${entry.line}:${entry.column}`),
      );
      stream.write(`\n${frames.join("\n")}\n`);
    }
    if (failure.output) {
      stream.write(
        `\n${indent(color.dim(firstLines(failure.output, OUTPUT_LINES_FOR_PEOPLE)), 4)}\n`,
      );
    }
    stream.write(
      color.dim(`\n    Full output: ${path.relative(process.cwd(), detail)}\n`),
    );
  };

  return {
    start(files) {
      results = createResults();
      startedAt = Date.now();
      total = files.length;
      remainingMs = files.reduce((sum, file) => sum + estimate(file), 0);
      writeDetail = createDetailWriter(detailDirectory);
      running.clear();
      if (isTerminal) {
        statusTimer = setInterval(showStatus, STATUS_INTERVAL_MS);
      }
      showStatus();
    },
    fileStarted({ file }) {
      running.set(file, Date.now());
    },
    fileDone(done) {
      running.delete(done.file);
      remainingMs -= estimate(done.file);
      results.add(done);
      if (done.result.failed > 0) {
        clearStatus();
        stream.write(
          `\n${color.red("✗")} ${color.bold(relative(done.file))}\n`,
        );
        for (const failure of done.result.failures) {
          printFailure(done.file, failure);
        }
      }
      showStatus();
    },
    failures: () => results.failures,
    confirming(fileCount) {
      clearInterval(statusTimer);
      clearStatus();
      stream.write(
        `\nRunning ${plural(fileCount, "failed file")} again, each alone in a new worker...\n`,
      );
    },
    finish(confirmation) {
      clearInterval(statusTimer);
      clearStatus();
      const { totals, failedFiles, durations } = results;
      const counts = [
        color.green(`${totals.passed.toLocaleString("en-US")} passed`),
      ];
      if (totals.failed > 0) {
        counts.push(color.red(`${totals.failed} failed`));
      }
      if (totals.skipped > 0) {
        counts.push(color.yellow(`${totals.skipped} skipped`));
      }
      const elapsed = clock((Date.now() - startedAt) / 1000);
      stream.write(
        `\n${plural(totals.files, "file")}, ${counts.join(", ")} in ${elapsed}\n`,
      );
      if (totals.files > MIN_FILES_FOR_SLOWEST) {
        stream.write(
          color.dim(`Slowest: ${slowestFiles(durations).join(", ")}\n`),
        );
      }
      if (confirmation) {
        printConfirmation(confirmation);
      }
      if (failedFiles.length > 0) {
        stream.write(
          `Rerun failed: ${rerunCommand(failedFiles.map(relative))}\n`,
        );
      }
      return failedFiles;
    },
  };

  function printConfirmation({ passedAlone, failedAgain }: Confirmation): void {
    if (failedAgain > 0) {
      stream.write(
        `${color.red(`${plural(failedAgain, "failing test")} failed again alone.`)}\n`,
      );
    }
    if (passedAlone.length > 0) {
      const pronoun = passedAlone.length === 1 ? "it" : "them";
      stream.write(
        color.yellow(
          `${plural(passedAlone.length, "failing test")} passed alone. Something that ran earlier in the same worker made ${pronoun} fail, or the test is not stable:\n`,
        ),
      );
      for (const { file, test } of passedAlone) {
        stream.write(`  ${relative(file)} > ${test}\n`);
      }
    }
  }
}

// For an agent or a pipe: no colour, no progress, fixed line prefixes, and a
// limit on how much a failure may print. The rest is in the detail files.
function createAgentReporter({
  root,
  stream,
  detailDirectory,
  rerunCommand,
}: ReporterOptions): Reporter {
  const relative = (file: string) => path.relative(root, file);
  let results = createResults();
  let startedAt = 0;
  let writeDetail = createDetailWriter(detailDirectory);
  let failuresShown = 0;

  const printFailure = (file: string, failure: TestFailure) => {
    const detail = path.relative(
      process.cwd(),
      writeDetail(relative(file), failure),
    );
    const [frame] = failure.frames;
    const where = frame ? `${frame.file}:${frame.line}` : relative(file);
    failuresShown += 1;
    if (failuresShown > FULL_FAILURES_FOR_AGENTS) {
      const firstLine = plain(failure.message)
        .split("\n")[0]
        .slice(0, SHORT_MESSAGE_LENGTH);
      stream.write(
        `FAIL ${where} > ${failure.test} | ${firstLine} | ${detail}\n`,
      );
      return;
    }
    stream.write(`FAIL ${where} > ${failure.test}\n`);
    // A message from Testing Library carries the whole rendered page after
    // its first paragraph. That part stays in the detail file.
    const message = plain(failure.message)
      .split(/\n\s*\n(?=Ignored nodes:|<body|\s*<)/)[0]
      .trim();
    stream.write(
      `${indent(firstLines(message, MESSAGE_LINES_FOR_AGENTS), 2)}\n`,
    );
    stream.write(`  detail: ${detail}\n`);
  };

  return {
    start() {
      results = createResults();
      startedAt = Date.now();
      writeDetail = createDetailWriter(detailDirectory);
      failuresShown = 0;
    },
    fileStarted() {},
    fileDone(done) {
      results.add(done);
      for (const failure of done.result.failures) {
        printFailure(done.file, failure);
      }
    },
    failures: () => results.failures,
    confirming() {},
    // ALONE says what a failing test did when its file ran again, alone in a
    // new worker. "pass" means the failure needs something that ran before it.
    finish(confirmation) {
      const { totals, failedFiles } = results;
      for (const { file, test } of confirmation?.passedAlone ?? []) {
        stream.write(`ALONE pass ${relative(file)} > ${test}\n`);
      }
      const fields = [
        `files=${totals.files}`,
        `passed=${totals.passed}`,
        `failed=${totals.failed}`,
        ...(confirmation
          ? [
              `failed_alone=${confirmation.failedAgain}`,
              `passed_alone=${confirmation.passedAlone.length}`,
            ]
          : []),
        `skipped=${totals.skipped}`,
        `seconds=${Math.round((Date.now() - startedAt) / 1000)}`,
      ];
      stream.write(`SUMMARY ${fields.join(" ")}\n`);
      if (failedFiles.length > 0) {
        stream.write(`RERUN ${rerunCommand(failedFiles.map(relative))}\n`);
      }
      return failedFiles;
    },
  };
}

// For a tool: one JSON object when the run ends.
function createJsonReporter({ root, stream }: ReporterOptions): Reporter {
  let results = createResults();
  let startedAt = 0;
  let files: object[] = [];
  return {
    start() {
      results = createResults();
      startedAt = Date.now();
      files = [];
    },
    fileStarted() {},
    fileDone(done) {
      results.add(done);
      files.push({
        file: path.relative(root, done.file),
        ms: done.durationMs,
        passed: done.result.passed,
        failed: done.result.failed,
        skipped: done.result.skipped,
        failures: done.result.failures.map((failure) => ({
          ...failure,
          message: plain(failure.message),
          stack: plain(failure.stack),
        })),
      });
    },
    failures: () => results.failures,
    confirming() {},
    finish(confirmation) {
      const alone = confirmation
        ? {
            failedAlone: confirmation.failedAgain,
            passedAlone: confirmation.passedAlone.map(({ file, test }) => ({
              file: path.relative(root, file),
              test,
            })),
          }
        : {};
      const summary = {
        ...results.totals,
        ...alone,
        seconds: (Date.now() - startedAt) / 1000,
        files,
      };
      stream.write(`${JSON.stringify(summary)}\n`);
      return results.failedFiles;
    },
  };
}

function createResults() {
  const totals = { files: 0, passed: 0, failed: 0, skipped: 0 };
  const failedFiles: string[] = [];
  const failures: FailedTest[] = [];
  const durations: Array<{ file: string; durationMs: number }> = [];
  return {
    totals,
    failedFiles,
    failures,
    durations,
    add({ file, durationMs, result }: FileDone) {
      totals.files += 1;
      totals.passed += result.passed;
      totals.failed += result.failed;
      totals.skipped += result.skipped;
      if (result.failed > 0) {
        failedFiles.push(file);
      }
      for (const failure of result.failures) {
        failures.push({ file, test: failure.test });
      }
      durations.push({ file, durationMs });
    },
  };
}

// Each failure also goes to a file of its own, in full. A view that shortens
// a failure names the file, so nothing is lost by the shortening.
function createDetailWriter(directory: string) {
  fs.rmSync(directory, { recursive: true, force: true });
  fs.mkdirSync(directory, { recursive: true });
  let count = 0;
  return (file: string, failure: TestFailure): string => {
    count += 1;
    const target = path.join(
      directory,
      `${String(count).padStart(3, "0")}.txt`,
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
  };
}

function sourceAround(root: string, frame: SourceFrame, color: Colors): string {
  let lines: string[];
  try {
    lines = fs.readFileSync(path.join(root, frame.file), "utf8").split("\n");
  } catch {
    return "";
  }
  const first = Math.max(1, frame.line - SOURCE_FRAME_LINES);
  const last = Math.min(lines.length, frame.line + SOURCE_FRAME_LINES);
  const width = String(last).length;
  const shown: string[] = [];
  for (let number = first; number <= last; number += 1) {
    const isFailingLine = number === frame.line;
    const text = `${isFailingLine ? ">" : " "} ${String(number).padStart(width)} | ${lines[number - 1]}`;
    shown.push(isFailingLine ? color.bold(text) : color.dim(text));
  }
  return shown.join("\n");
}

function longestRunning(
  running: Map<string, number>,
): { file: string; since: number } | null {
  let longest: { file: string; since: number } | null = null;
  for (const [file, since] of running) {
    if (!longest || since < longest.since) {
      longest = { file, since };
    }
  }
  return longest;
}

function slowestFiles(
  durations: Array<{ file: string; durationMs: number }>,
): string[] {
  return [...durations]
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, SLOWEST_FILES_SHOWN)
    .map(({ file, durationMs }) => {
      const name = path.basename(file).replace(/\.unit\.spec\.\w+$/, "");
      return `${name} ${Math.round(durationMs / 1000)} s`;
    });
}

function plain(text: string): string {
  return text.replace(ANSI, "");
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function clock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
}

function indent(text: string, spaces: number): string {
  return text
    .split("\n")
    .map((line) => (line === "" ? line : " ".repeat(spaces) + line))
    .join("\n");
}

function firstLines(text: string, limit: number): string {
  const lines = text.split("\n");
  if (lines.length <= limit) {
    return text;
  }
  return `${lines.slice(0, limit).join("\n")}\n... ${lines.length - limit} more lines`;
}
