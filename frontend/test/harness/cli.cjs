#!/usr/bin/env node
// Runs the unit specs on the node:test harness.
//
//   node frontend/test/harness/cli.cjs [pattern...] [options]
//
// A pattern selects spec files the way it does for jest: as a regular
// expression tested against the file's path. With no pattern every spec runs.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { root, projectOf, isProjectSource, mappedDirectories } = require("./jest-config.cjs");
const { createPool, estimateDuration, fastCores } = require("./pool.cjs");
const { createReporter, reporterNames } = require("./reporters.cjs");
const { createCiResults } = require("./ci-results.cjs");

const USAGE = `Usage: node frontend/test/harness/cli.cjs [pattern...] [options]

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

const parse = (argv) => {
  const options = { patterns: [], watch: false, workers: undefined, updateSnapshots: false, reporter: process.stdout.isTTY ? "human" : "agent", testNamePattern: undefined, confirm: true, bail: false, debug: false, ignoredProjects: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--watch") options.watch = true;
    else if (argument === "-t" || argument === "--test-name-pattern") options.testNamePattern = argv[(index += 1)];
    else if (argument.startsWith("--test-name-pattern=")) options.testNamePattern = argument.slice("--test-name-pattern=".length);
    else if (argument === "--no-confirm") options.confirm = false;
    else if (argument === "--bail") options.bail = true;
    else if (argument === "--debug") options.debug = true;
    else if (argument === "--reporter") options.reporter = argv[(index += 1)];
    else if (argument.startsWith("--reporter=")) options.reporter = argument.slice("--reporter=".length);
    else if (argument === "-w" || argument === "--workers") options.workers = Number(argv[(index += 1)]);
    else if (argument.startsWith("--workers=")) options.workers = Number(argument.slice("--workers=".length));
    else if (argument === "-u" || argument === "--update-snapshots") options.updateSnapshots = true;
    else if (argument === "--ignore-projects") options.ignoredProjects = argv[(index += 1)].split(",");
    else if (argument.startsWith("--ignore-projects=")) options.ignoredProjects = argument.slice("--ignore-projects=".length).split(",");
    else if (argument === "--shard") options.shard = argv[(index += 1)];
    else if (argument.startsWith("--shard=")) options.shard = argument.slice("--shard=".length);
    else if (argument === "--junit-file") options.junitFile = argv[(index += 1)];
    else if (argument.startsWith("--junit-file=")) options.junitFile = argument.slice("--junit-file=".length);
    else if (argument === "--json-file") options.jsonFile = argv[(index += 1)];
    else if (argument.startsWith("--json-file=")) options.jsonFile = argument.slice("--json-file=".length);
    else if (argument === "-h" || argument === "--help") { process.stdout.write(USAGE); process.exit(0); }
    else if (argument.startsWith("-")) { process.stderr.write(`Unknown option ${argument}\n\n${USAGE}`); process.exit(2); }
    else options.patterns.push(argument);
  }
  if (!reporterNames.includes(options.reporter)) { process.stderr.write(`--reporter is one of ${reporterNames.join(", ")}\n`); process.exit(2); }
  if (options.shard !== undefined) {
    const [part, parts] = options.shard.split("/").map(Number);
    if (!(Number.isInteger(part) && Number.isInteger(parts) && part >= 1 && part <= parts)) { process.stderr.write(`--shard needs two numbers such as 1/2\n`); process.exit(2); }
    options.shard = { part, parts };
  }
  if (options.workers !== undefined && !(options.workers >= 1)) { process.stderr.write(`--workers needs a number of 1 or more\n`); process.exit(2); }
  // A debugger attaches to one process, and a paused test must not time out.
  if (options.debug) { options.workers = 1; options.confirm = false; }
  return options;
};

const options = parse(process.argv.slice(2));
const relative = (file) => path.relative(root, file);

// Tracked files and new files that git does not ignore, so a spec that was just
// created is found and build output is not.
const findSpecs = () => {
  const listed = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 }).split("\n");
  const patterns = options.patterns.map((pattern) => new RegExp(pattern));
  // CI narrows a run to the spec files in this JSON list, as it does for jest.
  const selected = process.env.JEST_TEST_PATHS_FILE && new Set(JSON.parse(fs.readFileSync(process.env.JEST_TEST_PATHS_FILE, "utf8")).map((file) => path.resolve(file)));
  return listed
    .filter((file) => file !== "" && fs.existsSync(path.join(root, file)))
    .map((file) => path.join(root, file))
    .filter((file) => {
      const project = projectOf(file);
      if (!project || options.ignoredProjects.includes(project.name)) return false;
      if (selected && !selected.has(file)) return false;
      return patterns.length === 0 || patterns.some((pattern) => pattern.test(file));
    })
    // Every file is in exactly one part, and the parts take about the same time
    // because neighbours in path order go to different parts.
    .filter((file, index) => !options.shard || index % options.shard.parts === options.shard.part - 1);
};

const cacheDir = path.join(root, "node_modules/.cache/test-harness");

// spec file -> the project files it loaded the last time it ran
const loadedBy = new Map();

// The command that runs these spec files again, as the person or agent would type it.
const rerunCommand = (files) => {
  const script = process.env.npm_lifecycle_event;
  const base = script ? `bun run ${script}` : `node ${path.relative(process.cwd(), __filename)}`;
  return `${base} ${files.join(" ")}`;
};

const reporter = createReporter(options.reporter, {
  root,
  stream: process.stdout,
  workers: options.workers ?? fastCores(),
  estimate: estimateDuration,
  detailDirectory: path.join(cacheDir, "last-run"),
  rerunCommand,
});

const ciResults = options.junitFile || options.jsonFile ? createCiResults({ root }) : null;

const NO_TIME_LIMIT = String(2 ** 31 - 1);
const workerEnvironment = {
  ...(options.debug ? { NT_NODE_EXTRA: "--inspect-brk", NT_TIMEOUT: NO_TIME_LIMIT, NT_HOOK_TIMEOUT: NO_TIME_LIMIT, NT_MAX_RSS_MB: NO_TIME_LIMIT } : {}),
  ...(options.updateSnapshots ? { NT_UPDATE_SNAPSHOTS: "1" } : {}),
  ...(options.testNamePattern ? { NT_TEST_NAME_PATTERN: options.testNamePattern } : {}),
  // A worker that wins colour prints jest's matcher messages as jest does at a terminal.
  ...(options.reporter === "human" && process.stdout.isTTY ? { FORCE_COLOR: "1" } : {}),
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
    if (options.bail && done.result.failed > 0) pool.stop();
  },
});

// A spec file runs after others in a worker that keeps its packages loaded.
// jest gives every file a process state of its own. So a failed file runs one
// more time, alone in a new worker: a test that passes there did not fail on
// its own account, and the report says so. With many failed files the cause is
// in the code, and running them all again would only take time.
const MOST_FILES_TO_CONFIRM = 20;
const confirmFailures = async (failures) => {
  const files = [...new Set(failures.map(({ file }) => file))];
  if (!options.confirm || options.watch || files.length === 0 || files.length > MOST_FILES_TO_CONFIRM) return undefined;
  reporter.confirming(files.length);
  const failedAlone = new Map();
  const fresh = createPool({
    workers: Math.min(files.length, options.workers ?? fastCores()),
    env: { ...workerEnvironment, NT_MAX_FILES: "1" },
    onFileDone: ({ file, result }) => failedAlone.set(file, new Set(result.failures.map(({ test }) => test))),
  });
  await fresh.run(files);
  const passedAlone = failures.filter(({ file, test }) => failedAlone.has(file) && !failedAlone.get(file).has(test));
  return { files: files.length, passedAlone, failedAgain: failures.length - passedAlone.length };
};

// Runs the files and prints the result. Returns the spec files that failed and
// whether the run counts as failed.
const run = async (files) => {
  if (options.debug) process.stderr.write("The worker waits for a debugger. Open chrome://inspect, or attach your editor to the address below, then resume.\n");
  reporter.start(files);
  await pool.run(files);
  const confirmation = await confirmFailures(reporter.failures());
  ciResults?.write({ junitFile: options.junitFile, jsonFile: options.jsonFile, passedAlone: confirmation?.passedAlone });
  const failedFiles = reporter.finish(confirmation);
  const failed = confirmation ? confirmation.failedAgain > 0 : failedFiles.length > 0;
  return { failedFiles, failed };
};

const WATCHED = /\.(tsx?|jsx?|json|css)$/;
const watch = async (selected) => {
  let lastRun = selected;
  let failed = (await run(selected)).failedFiles;
  let running = false;
  const waiting = new Set();
  // Set when something changed that a worker loads only once.
  let stale = false;

  const prompt = () => process.stdout.write(`\nWatching ${selected.length} spec ${selected.length === 1 ? "file" : "files"}. Press a to run all, f to run the failed ones, Enter to run the last set again, q to quit.\n`);
  const start = async (files) => {
    if (files.length === 0) return;
    running = true;
    lastRun = files;
    failed = (await run(files)).failedFiles;
    running = false;
    watchEverythingKnown();
    if (waiting.size > 0) react();
    else prompt();
  };
  // A changed file reaches a spec that is the file itself or that loaded it.
  const react = () => {
    if (running || (waiting.size === 0 && !stale)) return;
    const changed = [...waiting];
    waiting.clear();
    pool.changed(changed);
    if (stale) {
      stale = false;
      pool.restart();
      process.stdout.write("\nA file outside the project's own code changed, such as a build output, a package or the jest config. The workers start again.\n");
      start(lastRun);
      return;
    }
    for (const file of findSpecs()) if (!selected.includes(file)) selected.push(file);
    const affected = selected.filter((spec) => changed.some((file) => file === spec || loadedBy.get(spec)?.has(file)));
    if (affected.length === 0) {
      process.stdout.write(`\n${changed.map(relative).join(", ")} changed. No selected spec loads it.\n`);
      return;
    }
    process.stdout.write(`\n${changed.map(relative).join(", ")} changed.\n`);
    start(affected);
  };

  // One recursive watcher for each top-level directory that holds a spec or a
  // file that a spec loaded.
  const watchedDirectories = new Set();
  let timer = null;
  function watchEverythingKnown() {
    for (const spec of selected) watchDirectoryOf(spec);
    for (const loaded of loadedBy.values()) for (const file of loaded) watchDirectoryOf(file);
  }
  const watchDirectoryOf = (file) => {
    const top = relative(file).split(path.sep)[0];
    if (!top || top === "node_modules" || top.startsWith("..") || watchedDirectories.has(top)) return;
    watchedDirectories.add(top);
    fs.watch(path.join(root, top), { recursive: true }, (event, name) => {
      // An editor's temporary file is a dot file next to the real one.
      if (!name || !WATCHED.test(name) || name.includes("node_modules") || path.basename(name).startsWith(".")) return;
      const file = path.join(root, top, name);
      // A worker loads the project's own code again for each spec file. It
      // keeps everything else, so a change there needs new workers. A build
      // writes many files, so that case waits longer for the changes to stop.
      const reloaded = isProjectSource(file) || !mappedDirectories.some((directory) => file.startsWith(directory + path.sep));
      if (reloaded) waiting.add(file);
      else stale = true;
      clearTimeout(timer);
      timer = setTimeout(react, stale ? 2000 : 150);
    });
  };
  watchEverythingKnown();
  for (const directory of mappedDirectories) if (fs.existsSync(directory)) watchDirectoryOf(path.join(directory, "x"));
  // The lock file and the jest config are at the root and stand for the packages
  // and the configuration.
  fs.watch(root, (event, name) => {
    if (name !== "bun.lock" && !/^jest\..*\.js$/.test(name ?? "")) return;
    stale = true;
    clearTimeout(timer);
    timer = setTimeout(react, 2000);
  });

  const quit = () => { pool.close(); process.exit(0); };
  process.on("SIGINT", quit);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", (data) => {
      const key = data.toString();
      if (key === "q" || key === "\u0003") quit();
      if (running) return;
      if (key === "a") start(selected);
      else if (key === "f") start(failed);
      else if (key === "\r" || key === "\n") start(lastRun);
    });
  }
  prompt();
};

(async () => {
  const specs = findSpecs();
  if (specs.length === 0) {
    // A selection or a shard can be empty, and CI still reads the result files.
    if (process.env.JEST_TEST_PATHS_FILE || options.shard) {
      ciResults?.write({ junitFile: options.junitFile, jsonFile: options.jsonFile });
      process.stdout.write("No spec file is in this selection.\n");
      return;
    }
    process.stderr.write(`No spec file matches ${options.patterns.join(" ") || "the jest config"}\n`);
    process.exit(1);
  }
  if (options.watch) { await watch(specs); return; }
  const { failed } = await run(specs);
  process.exitCode = failed ? 1 : 0;
})();
