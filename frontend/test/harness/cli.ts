// Runs the unit specs on the node:test runner.
//
//   node frontend/test/harness/cli.ts [pattern...] [options]
//
// A pattern selects spec files as it does for jest: a regular expression that
// is tested against the path of each spec. With no pattern, every spec runs.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { createCiResults } from "./ci-results.ts";
import {
  isProjectSource,
  mappedDirectories,
  projectOf,
  root,
} from "./jest-config.ts";
import { createPool, estimateDuration, fastCores } from "./pool.ts";
import {
  type Confirmation,
  type FailedTest,
  type ReporterName,
  createReporter,
  isReporterName,
  reporterNames,
} from "./reporters.ts";

type Options = {
  patterns: string[];
  testNamePattern?: string;
  watch: boolean;
  workers?: number;
  updateSnapshots: boolean;
  reporter: ReporterName;
  bail: boolean;
  debug: boolean;
  confirm: boolean;
  ignoredProjects: string[];
  shard?: { part: number; parts: number };
  junitFile?: string;
  jsonFile?: string;
};

const USAGE = `Usage: node frontend/test/harness/cli.ts [pattern...] [options]

  pattern                   run the spec files whose path matches this regular expression
  -t, --test-name-pattern <regex>
                            run only the tests whose full name matches
  --watch                   run again when a spec, or a file it loads, changes
  -w, --workers <n>         number of worker processes (default: one per fast core)
  -u, --update-snapshots    write snapshots that do not match
  --reporter <name>         human, agent or json (default: human at a terminal, agent otherwise)
  --bail                    stop after the first spec file that has a failed test
  --debug                   one worker that waits for a debugger, with no time limits
  --no-confirm              do not run a failed spec file again, alone, to see if it still fails
  --ignore-projects <a,b>   leave out the specs of these jest projects
  --shard <i>/<n>           run part i of n equal parts of the spec files
  --junit-file <file>       write a JUnit report, as jest-junit does
  --json-file <file>        write a summary of the results, as jest --json does
  -h, --help                show this text
`;

const CACHE_DIRECTORY = path.join(root, "node_modules/.cache/test-harness");
// With many failed files the cause is in the code, and running them all again
// would only take time.
const MAX_FILES_TO_CONFIRM = 20;
const NO_TIME_LIMIT = String(2 ** 31 - 1);
const WATCHED_FILES = /\.(tsx?|jsx?|json|css)$/;
const WATCH_SETTLE_MS = 150;
// A build or an install writes many files, so a change outside the project's
// own code waits longer for the writes to stop.
const WATCH_SETTLE_AFTER_REBUILD_MS = 2000;

const options = parseOptions(process.argv.slice(2));

// spec file -> the project files it loaded the last time it ran
const loadedBy = new Map<string, Set<string>>();

const reporter = createReporter(options.reporter, {
  root,
  stream: process.stdout,
  workers: options.workers ?? fastCores(),
  estimate: estimateDuration,
  detailDirectory: path.join(CACHE_DIRECTORY, "last-run"),
  rerunCommand,
});

const ciResults =
  options.junitFile || options.jsonFile ? createCiResults({ root }) : null;

const workerEnvironment: NodeJS.ProcessEnv = {
  ...(options.debug && {
    NT_NODE_EXTRA: "--inspect-brk",
    NT_TIMEOUT: NO_TIME_LIMIT,
    NT_HOOK_TIMEOUT: NO_TIME_LIMIT,
    NT_MAX_RSS_MB: NO_TIME_LIMIT,
  }),
  ...(options.updateSnapshots && { NT_UPDATE_SNAPSHOTS: "1" }),
  ...(options.testNamePattern && {
    NT_TEST_NAME_PATTERN: options.testNamePattern,
  }),
  // A worker that writes colour prints jest's matcher messages as jest does at
  // a terminal.
  ...(options.reporter === "human" &&
    process.stdout.isTTY && { FORCE_COLOR: "1" }),
};

const pool = createPool({
  workers: options.workers,
  keepAlive: options.watch,
  env: workerEnvironment,
  onFileStart: (started) => reporter.fileStarted(started),
  onFileDone: (done) => {
    loadedBy.set(done.file, new Set(done.loaded));
    reporter.fileDone(done);
    ciResults?.add(done);
    if (options.bail && done.result.failed > 0) {
      pool.stop();
    }
  },
});

await main();

async function main(): Promise<void> {
  const specs = findSpecs();
  if (specs.length === 0) {
    // A selection or a shard can be empty, and CI still reads the result files.
    if (process.env.JEST_TEST_PATHS_FILE || options.shard) {
      writeCiResults();
      process.stdout.write("No spec file is in this selection.\n");
      return;
    }
    process.stderr.write(
      `No spec file matches ${options.patterns.join(" ") || "the jest config"}\n`,
    );
    process.exit(1);
  }
  if (options.watch) {
    await watch(specs);
    return;
  }
  const { failed } = await run(specs);
  process.exitCode = failed ? 1 : 0;
}

function parseOptions(argv: string[]): Options {
  try {
    return readOptions(argv);
  } catch (error) {
    exitWithUsageError(error instanceof Error ? error.message : String(error));
  }
}

function readOptions(argv: string[]): Options {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      "test-name-pattern": { type: "string", short: "t" },
      watch: { type: "boolean" },
      workers: { type: "string", short: "w" },
      "update-snapshots": { type: "boolean", short: "u" },
      reporter: { type: "string" },
      bail: { type: "boolean" },
      debug: { type: "boolean" },
      "no-confirm": { type: "boolean" },
      "ignore-projects": { type: "string" },
      shard: { type: "string" },
      "junit-file": { type: "string" },
      "json-file": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }
  const reporter =
    values.reporter ?? (process.stdout.isTTY ? "human" : "agent");
  if (!isReporterName(reporter)) {
    exitWithUsageError(`--reporter is one of ${reporterNames.join(", ")}`);
  }
  const debug = values.debug ?? false;
  const workers =
    values.workers === undefined ? undefined : Number(values.workers);
  if (workers !== undefined && !(workers >= 1)) {
    exitWithUsageError("--workers needs a number of 1 or more");
  }
  return {
    patterns: positionals,
    testNamePattern: values["test-name-pattern"],
    watch: values.watch ?? false,
    // A debugger attaches to one process, and a paused test must not time
    // out, nor run a second time.
    workers: debug ? 1 : workers,
    confirm: !values["no-confirm"] && !debug,
    updateSnapshots: values["update-snapshots"] ?? false,
    reporter,
    bail: values.bail ?? false,
    debug,
    ignoredProjects: (values["ignore-projects"] ?? "")
      .split(",")
      .filter(Boolean),
    shard: values.shard === undefined ? undefined : parseShard(values.shard),
    junitFile: values["junit-file"],
    jsonFile: values["json-file"],
  };
}

function parseShard(value: string): { part: number; parts: number } {
  const [part, parts] = value.split("/").map(Number);
  if (
    !(
      Number.isInteger(part) &&
      Number.isInteger(parts) &&
      part >= 1 &&
      part <= parts
    )
  ) {
    exitWithUsageError("--shard needs two numbers such as 1/2");
  }
  return { part, parts };
}

function exitWithUsageError(message: string): never {
  process.stderr.write(`${message}\n\n${USAGE}`);
  process.exit(2);
}

// Tracked files and new files that git does not ignore, so a spec that was
// just created is found and build output is not.
function findSpecs(): string[] {
  const listed = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 },
  ).split("\n");
  const selected = readSelection();
  const patterns = options.patterns.map((pattern) => new RegExp(pattern));
  return listed
    .filter((file) => file !== "")
    .map((file) => path.join(root, file))
    .filter((file) => {
      const project = projectOf(file);
      return (
        project !== undefined &&
        !options.ignoredProjects.includes(project.name) &&
        (!selected || selected.has(file)) &&
        (patterns.length === 0 ||
          patterns.some((pattern) => pattern.test(file))) &&
        fs.existsSync(file)
      );
    })
    .filter(isInShard);
}

// CI narrows a run to the spec files in this JSON list, as it does for jest.
function readSelection(): Set<string> | null {
  const selectionFile = process.env.JEST_TEST_PATHS_FILE;
  if (!selectionFile) {
    return null;
  }
  const listed: unknown = JSON.parse(fs.readFileSync(selectionFile, "utf8"));
  if (!Array.isArray(listed)) {
    throw new Error(`${selectionFile} does not hold a list of spec files`);
  }
  return new Set(listed.map((file) => path.resolve(String(file))));
}

// Every file is in exactly one part, and the parts take about the same time,
// because neighbours in path order go to different parts.
function isInShard(_file: string, index: number): boolean {
  return (
    !options.shard || index % options.shard.parts === options.shard.part - 1
  );
}

/**
 * The command that runs these spec files again, as a person or an agent would
 * type it.
 */
function rerunCommand(files: string[]): string {
  const script = process.env.npm_lifecycle_event;
  const command = script
    ? `bun run ${script}`
    : `node ${path.relative(process.cwd(), import.meta.filename)}`;
  return `${command} ${files.join(" ")}`;
}

function relative(file: string): string {
  return path.relative(root, file);
}

function writeCiResults(passedAlone?: FailedTest[]): void {
  ciResults?.write({
    junitFile: options.junitFile,
    jsonFile: options.jsonFile,
    passedAlone,
  });
}

// Runs the files and prints the result. Returns the spec files that failed,
// and whether the run counts as failed.
async function run(
  files: string[],
): Promise<{ failedFiles: string[]; failed: boolean }> {
  if (options.debug) {
    process.stderr.write(
      "The worker waits for a debugger. Open chrome://inspect, or attach your editor to the address below, then resume.\n",
    );
  }
  reporter.start(files);
  await pool.run(files);
  const confirmation = await confirmFailures(reporter.failures());
  writeCiResults(confirmation?.passedAlone);
  const failedFiles = reporter.finish(confirmation);
  const failed = confirmation
    ? confirmation.failedAgain > 0
    : failedFiles.length > 0;
  return { failedFiles, failed };
}

// A worker keeps its packages loaded between spec files, where jest gives
// every file a fresh state. So a failed file runs once more, alone in a new
// worker: a test that passes there did not fail on its own account.
async function confirmFailures(
  failures: FailedTest[],
): Promise<Confirmation | undefined> {
  const files = [...new Set(failures.map(({ file }) => file))];
  if (
    !options.confirm ||
    options.watch ||
    files.length === 0 ||
    files.length > MAX_FILES_TO_CONFIRM
  ) {
    return undefined;
  }
  reporter.confirming(files.length);
  const failedAlone = new Map<string, Set<string>>();
  const freshPool = createPool({
    workers: Math.min(files.length, options.workers ?? fastCores()),
    env: { ...workerEnvironment, NT_MAX_FILES: "1" },
    onFileDone: ({ file, result }) =>
      failedAlone.set(file, new Set(result.failures.map(({ test }) => test))),
  });
  await freshPool.run(files);
  const passedAlone = failures.filter(
    ({ file, test }) =>
      failedAlone.has(file) && !failedAlone.get(file)?.has(test),
  );
  return {
    files: files.length,
    passedAlone,
    failedAgain: failures.length - passedAlone.length,
  };
}

async function watch(selected: string[]): Promise<void> {
  let lastRun = selected;
  let failed = (await run(selected)).failedFiles;
  let running = false;
  const waiting = new Set<string>();
  // Set when something changed that a worker loads only once.
  let workersAreStale = false;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  const watchedDirectories = new Set<string>();

  const prompt = () => {
    const files = selected.length === 1 ? "file" : "files";
    process.stdout.write(
      `\nWatching ${selected.length} spec ${files}. Press a to run all, f to run the failed ones, Enter to run the last set again, q to quit.\n`,
    );
  };

  const start = async (files: string[]) => {
    if (files.length === 0) {
      return;
    }
    running = true;
    lastRun = files;
    failed = (await run(files)).failedFiles;
    running = false;
    watchEverythingKnown();
    if (waiting.size > 0) {
      react();
    } else {
      prompt();
    }
  };

  // A changed file reaches a spec that is the file itself or that loaded it.
  const react = () => {
    if (running || (waiting.size === 0 && !workersAreStale)) {
      return;
    }
    const changed = [...waiting];
    waiting.clear();
    pool.changed(changed);
    if (workersAreStale) {
      workersAreStale = false;
      pool.restart();
      process.stdout.write(
        "\nA file outside the project's own code changed, such as a build output, a package or the jest config. The workers start again.\n",
      );
      void start(lastRun);
      return;
    }
    for (const file of findSpecs()) {
      if (!selected.includes(file)) {
        selected.push(file);
      }
    }
    const affected = selected.filter((spec) =>
      changed.some((file) => file === spec || loadedBy.get(spec)?.has(file)),
    );
    const changedNames = changed.map(relative).join(", ");
    if (affected.length === 0) {
      process.stdout.write(
        `\n${changedNames} changed. No selected spec loads it.\n`,
      );
      return;
    }
    process.stdout.write(`\n${changedNames} changed.\n`);
    void start(affected);
  };

  const scheduleReaction = () => {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(
      react,
      workersAreStale ? WATCH_SETTLE_AFTER_REBUILD_MS : WATCH_SETTLE_MS,
    );
  };

  // One recursive watcher for each top-level directory that holds a spec or
  // a file that a spec loaded.
  const watchDirectoryOf = (file: string) => {
    const [topLevel] = relative(file).split(path.sep);
    if (
      !topLevel ||
      topLevel === "node_modules" ||
      topLevel.startsWith("..") ||
      watchedDirectories.has(topLevel)
    ) {
      return;
    }
    watchedDirectories.add(topLevel);
    fs.watch(path.join(root, topLevel), { recursive: true }, (_event, name) => {
      // An editor's temporary file is a dot file next to the real one.
      if (
        !name ||
        !WATCHED_FILES.test(name) ||
        name.includes("node_modules") ||
        path.basename(name).startsWith(".")
      ) {
        return;
      }
      const file = path.join(root, topLevel, name);
      // A worker evaluates the project's own code again for each spec file.
      // It keeps everything else, so a change there needs new workers.
      const isReloaded =
        isProjectSource(file) ||
        !mappedDirectories.some((directory) =>
          file.startsWith(directory + path.sep),
        );
      if (isReloaded) {
        waiting.add(file);
      } else {
        workersAreStale = true;
      }
      scheduleReaction();
    });
  };

  const watchEverythingKnown = () => {
    for (const spec of selected) {
      watchDirectoryOf(spec);
    }
    for (const loaded of loadedBy.values()) {
      for (const file of loaded) {
        watchDirectoryOf(file);
      }
    }
  };

  watchEverythingKnown();
  for (const directory of mappedDirectories) {
    if (fs.existsSync(directory)) {
      watchDirectoryOf(path.join(directory, "x"));
    }
  }
  // The lock file and the jest config are at the root, and stand for the
  // packages and the configuration.
  fs.watch(root, (_event, name) => {
    if (name !== "bun.lock" && !/^jest\..*\.js$/.test(name ?? "")) {
      return;
    }
    workersAreStale = true;
    scheduleReaction();
  });

  const quit = () => {
    pool.close();
    process.exit(0);
  };
  process.on("SIGINT", quit);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", (data) => {
      const key = data.toString();
      if (key === "q" || key === "\u0003") {
        quit();
      }
      if (running) {
        return;
      }
      if (key === "a") {
        void start(selected);
      } else if (key === "f") {
        void start(failed);
      } else if (key === "\r" || key === "\n") {
        void start(lastRun);
      }
    });
  }
  prompt();
}
