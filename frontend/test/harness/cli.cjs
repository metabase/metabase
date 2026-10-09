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

const { root, projectOf } = require("./jest-config.cjs");
const { createPool } = require("./pool.cjs");

const USAGE = `Usage: node frontend/test/harness/cli.cjs [pattern...] [options]

  pattern                   run the spec files whose path matches this regular expression
  --watch                   run again when a spec, or a file it loads, changes
  -w, --workers <n>         number of worker processes (default: one per fast core)
  -u, --update-snapshots    write snapshots that do not match
  --ignore-projects <a,b>   leave out the specs of these jest projects
  -h, --help                show this text
`;

const parse = (argv) => {
  const options = { patterns: [], watch: false, workers: undefined, updateSnapshots: false, ignoredProjects: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--watch") options.watch = true;
    else if (argument === "-w" || argument === "--workers") options.workers = Number(argv[(index += 1)]);
    else if (argument.startsWith("--workers=")) options.workers = Number(argument.slice("--workers=".length));
    else if (argument === "-u" || argument === "--update-snapshots") options.updateSnapshots = true;
    else if (argument === "--ignore-projects") options.ignoredProjects = argv[(index += 1)].split(",");
    else if (argument.startsWith("--ignore-projects=")) options.ignoredProjects = argument.slice("--ignore-projects=".length).split(",");
    else if (argument === "-h" || argument === "--help") { process.stdout.write(USAGE); process.exit(0); }
    else if (argument.startsWith("-")) { process.stderr.write(`Unknown option ${argument}\n\n${USAGE}`); process.exit(2); }
    else options.patterns.push(argument);
  }
  if (options.workers !== undefined && !(options.workers >= 1)) { process.stderr.write(`--workers needs a number of 1 or more\n`); process.exit(2); }
  return options;
};

const options = parse(process.argv.slice(2));
const relative = (file) => path.relative(root, file);

// Tracked files and new files that git does not ignore, so a spec that was just
// created is found and build output is not.
const findSpecs = () => {
  const listed = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 }).split("\n");
  const patterns = options.patterns.map((pattern) => new RegExp(pattern));
  return listed
    .filter((file) => file !== "" && fs.existsSync(path.join(root, file)))
    .map((file) => path.join(root, file))
    .filter((file) => {
      const project = projectOf(file);
      if (!project || options.ignoredProjects.includes(project.name)) return false;
      return patterns.length === 0 || patterns.some((pattern) => pattern.test(file));
    });
};

const cacheDir = path.join(root, "node_modules/.cache/test-harness");
fs.mkdirSync(cacheDir, { recursive: true });
const failuresFile = path.join(cacheDir, `failures-${process.pid}.tsv`);
const detailFile = path.join(cacheDir, `failures-${process.pid}.txt`);
const removeResultFiles = () => { for (const file of [failuresFile, detailFile]) fs.rmSync(file, { force: true }); };
process.on("exit", removeResultFiles);

// spec file -> the project files it loaded the last time it ran
const loadedBy = new Map();
let progress = { done: 0, total: 0 };
const showProgress = () => {
  if (process.stderr.isTTY) process.stderr.write(`\r${progress.done} of ${progress.total} spec files`);
};

const pool = createPool({
  workers: options.workers,
  keepAlive: options.watch,
  env: { NT_FAILURES: failuresFile, NT_FAILURE_DETAIL: detailFile, ...(options.updateSnapshots ? { NT_UPDATE_SNAPSHOTS: "1" } : {}) },
  onFileDone: ({ file, loaded }) => {
    loadedBy.set(file, new Set(loaded));
    progress.done += 1;
    showProgress();
  },
});

const readFailures = () => {
  if (!fs.existsSync(failuresFile)) return [];
  return fs.readFileSync(failuresFile, "utf8").split("\n").filter(Boolean).map((line) => {
    const [file, test, message] = line.split("\t");
    return { file, test, message };
  });
};
const DETAIL_LINES = 40;
const printDetail = () => {
  if (!fs.existsSync(detailFile)) return;
  const blocks = fs.readFileSync(detailFile, "utf8").split(/\n(?====== )/);
  for (const block of blocks) {
    const lines = block.split("\n").filter((line) => line.trim() !== "" && !line.includes("node:internal") && !line.includes(__dirname + path.sep));
    if (lines.length === 0) continue;
    process.stdout.write(`\n${lines.slice(0, DETAIL_LINES).join("\n")}\n`);
    if (lines.length > DETAIL_LINES) process.stdout.write(`  ... ${lines.length - DETAIL_LINES} more lines\n`);
  }
};

// Runs the files and prints the result. Returns the spec files that failed.
const run = async (files) => {
  removeResultFiles();
  progress = { done: 0, total: files.length };
  const started = Date.now();
  showProgress();
  await pool.run(files);
  if (process.stderr.isTTY) process.stderr.write("\r\x1b[K");
  const failures = readFailures();
  const failedFiles = [...new Set(failures.map(({ file }) => path.resolve(root, file)))];
  printDetail();
  if (failures.length > 0) {
    process.stdout.write("\nFailing tests:\n");
    for (const { file, test, message } of failures) process.stdout.write(`  ${file} > ${test}\n      ${message}\n`);
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const outcome = failures.length === 0 ? "all passed" : `${failures.length} failing ${failures.length === 1 ? "test" : "tests"} in ${failedFiles.length} ${failedFiles.length === 1 ? "file" : "files"}`;
  process.stdout.write(`\n${files.length} spec ${files.length === 1 ? "file" : "files"}, ${outcome}, ${seconds} s\n`);
  return failedFiles;
};

const WATCHED = /\.(tsx?|jsx?|json|css)$/;
const watch = async (selected) => {
  let lastRun = selected;
  let failed = await run(selected);
  let running = false;
  const waiting = new Set();

  const prompt = () => process.stdout.write(`\nWatching ${selected.length} spec ${selected.length === 1 ? "file" : "files"}. Press a to run all, f to run the failed ones, Enter to run the last set again, q to quit.\n`);
  const start = async (files) => {
    if (files.length === 0) return;
    running = true;
    lastRun = files;
    failed = await run(files);
    running = false;
    watchEverythingKnown();
    if (waiting.size > 0) react();
    else prompt();
  };
  // A changed file reaches a spec that is the file itself or that loaded it.
  const react = () => {
    if (running || waiting.size === 0) return;
    const changed = [...waiting];
    waiting.clear();
    pool.changed(changed);
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
      waiting.add(path.join(root, top, name));
      clearTimeout(timer);
      timer = setTimeout(react, 150);
    });
  };
  watchEverythingKnown();

  const quit = () => { pool.close(); removeResultFiles(); process.exit(0); };
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
    process.stderr.write(`No spec file matches ${options.patterns.join(" ") || "the jest config"}\n`);
    process.exit(1);
  }
  if (options.watch) { await watch(specs); return; }
  const failed = await run(specs);
  process.exitCode = failed.length === 0 ? 0 : 1;
})();
