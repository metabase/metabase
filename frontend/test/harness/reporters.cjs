// How a run is shown. One stream of results, three ways to print it: for a
// person at a terminal, for an agent or a pipe, and as JSON for a tool.
const fs = require("node:fs");
const path = require("node:path");

const ANSI = /\x1b\[[0-9;]*m/g;
const plain = (text) => text.replace(ANSI, "");
const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
const indent = (text, spaces) => text.split("\n").map((line) => (line === "" ? line : " ".repeat(spaces) + line)).join("\n");
const firstLines = (text, limit) => {
  const lines = text.split("\n");
  return lines.length <= limit ? text : `${lines.slice(0, limit).join("\n")}\n... ${lines.length - limit} more lines`;
};

// Each failure also goes to a file of its own, in full. A view that shortens a
// failure names the file, so nothing is lost by the shortening.
const createDetailWriter = (directory) => {
  fs.rmSync(directory, { recursive: true, force: true });
  fs.mkdirSync(directory, { recursive: true });
  let count = 0;
  return (file, failure) => {
    count += 1;
    const target = path.join(directory, `${String(count).padStart(3, "0")}.txt`);
    const parts = [`${file} > ${failure.test}`, "", plain(failure.message), "", plain(failure.stack)];
    if (failure.output) parts.push("", "Console output:", failure.output);
    fs.writeFileSync(target, parts.join("\n") + "\n");
    return target;
  };
};

const collect = () => {
  const totals = { files: 0, passed: 0, failed: 0, skipped: 0 };
  const failedFiles = [];
  const slowest = [];
  return {
    totals,
    failedFiles,
    slowest,
    add({ file, ms, result }) {
      totals.files += 1;
      totals.passed += result.passed;
      totals.failed += result.failed;
      totals.skipped += result.skipped;
      if (result.failed > 0) failedFiles.push(file);
      slowest.push({ file, ms });
    },
  };
};

const SOURCE_FRAME_LINES = 2;
const sourceFrame = (root, frame, color) => {
  let lines;
  try { lines = fs.readFileSync(path.join(root, frame.file), "utf8").split("\n"); } catch { return ""; }
  const first = Math.max(1, frame.line - SOURCE_FRAME_LINES);
  const last = Math.min(lines.length, frame.line + SOURCE_FRAME_LINES);
  const width = String(last).length;
  const shown = [];
  for (let number = first; number <= last; number += 1) {
    const marker = number === frame.line ? ">" : " ";
    const text = `${marker} ${String(number).padStart(width)} | ${lines[number - 1]}`;
    shown.push(number === frame.line ? color.bold(text) : color.dim(text));
  }
  return shown.join("\n");
};

const MESSAGE_LINES_FOR_PEOPLE = 40;
const OUTPUT_LINES_FOR_PEOPLE = 15;

// For a person at a terminal: one line that shows progress while the run goes
// on, each failure as it happens, and a short summary at the end.
const createHumanReporter = ({ root, stream, workers, estimate, detailDirectory, rerunCommand }) => {
  const live = stream.isTTY === true;
  const paint = (code) => (text) => (live ? `\x1b[${code}m${text}\x1b[0m` : text);
  const color = { red: paint("31"), green: paint("32"), yellow: paint("33"), dim: paint("2"), bold: paint("1") };
  const relative = (file) => path.relative(root, file);
  let state;
  let writeDetail;
  let timer;
  let remainingMs;
  const running = new Map();

  const status = () => {
    if (!live) return;
    const seconds = (Date.now() - state.started) / 1000;
    const parts = [`${state.results.totals.files}/${state.total} files`];
    if (state.results.totals.failed > 0) parts.push(color.red(`${state.results.totals.failed} failed`));
    parts.push(`${clock(seconds)} elapsed`);
    if (remainingMs > 0 && state.results.totals.files < state.total) parts.push(`about ${clock(remainingMs / 1000 / workers)} left`);
    let longest = null;
    for (const [file, since] of running) if (!longest || since < longest.since) longest = { file, since };
    if (longest && Date.now() - longest.since > 3000) parts.push(color.dim(`running: ${path.basename(longest.file)} (${Math.round((Date.now() - longest.since) / 1000)} s)`));
    stream.write(`\r\x1b[K${parts.join("   ")}`);
  };
  const clearStatus = () => { if (live) stream.write("\r\x1b[K"); };

  const printFailures = (file, result) => {
    clearStatus();
    stream.write(`\n${color.red("✗")} ${color.bold(relative(file))}\n`);
    for (const failure of result.failures) {
      const detail = writeDetail(relative(file), failure);
      stream.write(`\n  ${color.red("●")} ${failure.test}\n\n`);
      // The message is the one jest's expect built, so a failed matcher reads
      // here exactly as it does under jest, diff and all.
      stream.write(`${indent(firstLines(live ? failure.message : plain(failure.message), MESSAGE_LINES_FOR_PEOPLE), 4)}\n`);
      const [frame] = failure.frames;
      if (frame) {
        const shown = sourceFrame(root, frame, color);
        if (shown) stream.write(`\n${indent(shown, 4)}\n`);
        stream.write(`\n${failure.frames.map((entry) => color.dim(`      at ${entry.file}:${entry.line}:${entry.column}`)).join("\n")}\n`);
      }
      if (failure.output) stream.write(`\n${indent(color.dim(firstLines(failure.output, OUTPUT_LINES_FOR_PEOPLE)), 4)}\n`);
      stream.write(color.dim(`\n    Full output: ${path.relative(process.cwd(), detail)}\n`));
    }
  };

  return {
    start(files) {
      state = { started: Date.now(), total: files.length, results: collect() };
      writeDetail = createDetailWriter(detailDirectory);
      remainingMs = files.reduce((sum, file) => sum + estimate(file), 0);
      running.clear();
      if (live) timer = setInterval(status, 250);
      status();
    },
    fileStarted({ file }) { running.set(file, Date.now()); },
    fileDone(done) {
      running.delete(done.file);
      remainingMs -= estimate(done.file);
      state.results.add(done);
      if (done.result.failed > 0) printFailures(done.file, done.result);
      status();
    },
    finish() {
      clearInterval(timer);
      clearStatus();
      const { totals, failedFiles, slowest } = state.results;
      const seconds = (Date.now() - state.started) / 1000;
      const counts = [color.green(`${totals.passed.toLocaleString("en-US")} passed`)];
      if (totals.failed > 0) counts.push(color.red(`${totals.failed} failed`));
      if (totals.skipped > 0) counts.push(color.yellow(`${totals.skipped} skipped`));
      stream.write(`\n${plural(totals.files, "file")}, ${counts.join(", ")} in ${clock(seconds)}\n`);
      if (totals.files > 20) {
        const top = slowest.sort((a, b) => b.ms - a.ms).slice(0, 3).map(({ file, ms }) => `${path.basename(file).replace(/\.unit\.spec\.\w+$/, "")} ${Math.round(ms / 1000)} s`);
        stream.write(color.dim(`Slowest: ${top.join(", ")}\n`));
      }
      if (failedFiles.length > 0) stream.write(`Rerun failed: ${rerunCommand(failedFiles.map(relative))}\n`);
      return failedFiles;
    },
  };
};

const FULL_FAILURES_FOR_AGENTS = 10;
const MESSAGE_LINES_FOR_AGENTS = 30;

// For an agent or a pipe: no colour, no progress, fixed line prefixes, and a
// limit on how much a failure may print. The rest is in the detail files.
const createAgentReporter = ({ root, stream, detailDirectory, rerunCommand }) => {
  const relative = (file) => path.relative(root, file);
  let state;
  let writeDetail;
  let shown;
  return {
    start(files) {
      state = { started: Date.now(), total: files.length, results: collect() };
      writeDetail = createDetailWriter(detailDirectory);
      shown = 0;
    },
    fileStarted() {},
    fileDone(done) {
      state.results.add(done);
      for (const failure of done.result.failures) {
        const detail = path.relative(process.cwd(), writeDetail(relative(done.file), failure));
        const [frame] = failure.frames;
        const where = frame ? `${frame.file}:${frame.line}` : relative(done.file);
        shown += 1;
        if (shown > FULL_FAILURES_FOR_AGENTS) {
          stream.write(`FAIL ${where} > ${failure.test} | ${plain(failure.message).split("\n")[0].slice(0, 160)} | ${detail}\n`);
          continue;
        }
        stream.write(`FAIL ${where} > ${failure.test}\n`);
        // A message from Testing Library carries the whole rendered page after
        // its first paragraph. That part stays in the detail file.
        const message = plain(failure.message).split(/\n\s*\n(?=Ignored nodes:|<body|\s*<)/)[0].trim();
        stream.write(`${indent(firstLines(message, MESSAGE_LINES_FOR_AGENTS), 2)}\n`);
        stream.write(`  detail: ${detail}\n`);
      }
    },
    finish() {
      const { totals, failedFiles } = state.results;
      const seconds = Math.round((Date.now() - state.started) / 1000);
      stream.write(`SUMMARY files=${totals.files} passed=${totals.passed} failed=${totals.failed} skipped=${totals.skipped} seconds=${seconds}\n`);
      if (failedFiles.length > 0) stream.write(`RERUN ${rerunCommand(failedFiles.map(relative))}\n`);
      return failedFiles;
    },
  };
};

// For a tool: one JSON object when the run ends.
const createJsonReporter = ({ root, stream }) => {
  let state;
  let files;
  return {
    start() { state = { started: Date.now(), results: collect() }; files = []; },
    fileStarted() {},
    fileDone(done) {
      state.results.add(done);
      files.push({
        file: path.relative(root, done.file),
        ms: done.ms,
        passed: done.result.passed,
        failed: done.result.failed,
        skipped: done.result.skipped,
        failures: done.result.failures.map((failure) => ({ ...failure, message: plain(failure.message), stack: plain(failure.stack) })),
      });
    },
    finish() {
      stream.write(`${JSON.stringify({ ...state.results.totals, seconds: (Date.now() - state.started) / 1000, files })}\n`);
      return state.results.failedFiles;
    },
  };
};

const REPORTERS = { human: createHumanReporter, agent: createAgentReporter, json: createJsonReporter };

module.exports = {
  reporterNames: Object.keys(REPORTERS),
  createReporter: (name, options) => REPORTERS[name](options),
};
