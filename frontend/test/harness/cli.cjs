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
const { createPool, estimateDuration, fastCores } = require("./pool.cjs");
const { createReporter, reporterNames } = require("./reporters.cjs");

const USAGE = `Usage: node frontend/test/harness/cli.cjs [pattern...] [options]

  pattern                   run the spec files whose path matches this regular expression
  --watch                   run again when a spec, or a file it loads, changes
  -w, --workers <n>         number of worker processes (default: one per fast core)
  -u, --update-snapshots    write snapshots that do not match
  --reporter <name>         human, agent or json (default: human at a terminal, agent otherwise)
  --ignore-projects <a,b>   leave out the specs of these jest projects
  -h, --help                show this text
`;

const parse = (argv) => {
  const options = { patterns: [], watch: false, workers: undefined, updateSnapshots: false, reporter: process.stdout.isTTY ? "human" : "agent", ignoredProjects: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--watch") options.watch = true;
    else if (argument === "--reporter") options.reporter = argv[(index += 1)];
    else if (argument.startsWith("--reporter=")) options.reporter = argument.slice("--reporter=".length);
    else if (argument === "-w" || argument === "--workers") options.workers = Number(argv[(index += 1)]);
    else if (argument.startsWith("--workers=")) options.workers = Number(argument.slice("--workers=".length));
    else if (argument === "-u" || argument === "--update-snapshots") options.updateSnapshots = true;
    else if (argument === "--ignore-projects") options.ignoredProjects = argv[(index += 1)].split(",");
    else if (argument.startsWith("--ignore-projects=")) options.ignoredProjects = argument.slice("--ignore-projects=".length).split(",");
    else if (argument === "-h" || argument === "--help") { process.stdout.write(USAGE); process.exit(0); }
    else if (argument.startsWith("-")) { process.stderr.write(`Unknown option ${argument}\n\n${USAGE}`); process.exit(2); }
    else options.patterns.push(argument);
  }
  if (!reporterNames.includes(options.reporter)) { process.stderr.write(`--reporter is one of ${reporterNames.join(", ")}\n`); process.exit(2); }
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

const pool = createPool({
  workers: options.workers,
  keepAlive: options.watch,
  // A worker that wins colour prints jest's matcher messages as jest does at a terminal.
  env: { ...(options.updateSnapshots ? { NT_UPDATE_SNAPSHOTS: "1" } : {}), ...(options.reporter === "human" && process.stdout.isTTY ? { FORCE_COLOR: "1" } : {}) },
  onFileStart: (started) => reporter.fileStarted(started),
  onFileDone: (done) => {
    loadedBy.set(done.file, new Set(done.loaded));
    reporter.fileDone(done);
  },
});

// Runs the files and prints the result. Returns the spec files that failed.
const run = async (files) => {
  reporter.start(files);
  await pool.run(files);
  return reporter.finish();
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
    process.stderr.write(`No spec file matches ${options.patterns.join(" ") || "the jest config"}\n`);
    process.exit(1);
  }
  if (options.watch) { await watch(specs); return; }
  const failed = await run(specs);
  process.exitCode = failed.length === 0 ? 0 : 1;
})();
