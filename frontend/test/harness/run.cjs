/* eslint-disable */
// Entry point: node --require ./hooks.cjs run.cjs <files...|@list-file>
// Every spec file runs in this one process, one after the other. Files that
// mock modules run last, each with a fresh registry of project modules.
//
// Memory is bounded from the inside: after each file the process compares its
// resident size with NT_MAX_RSS_MB. Above it, the process writes the files it
// has not run to NT_REMAINING and exits with code 75, and the launcher starts
// a fresh process for them.
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const MAX_RSS_MB = Number(process.env.NT_MAX_RSS_MB ?? 1500);
const MAX_FILES = Number(process.env.NT_MAX_FILES ?? Infinity);
const RECYCLE_EXIT_CODE = 75;
const megabytes = (bytes) => Math.round(bytes / 1024 / 1024);

const files = process.argv.slice(2)
  .flatMap((arg) => (arg.startsWith("@") ? fs.readFileSync(arg.slice(1), "utf8").split("\n").filter(Boolean) : [arg]))
  .map((file) => ({ file, mocks: /\bjest\.(mock|doMock|unmock|resetModules|isolateModules)\(/.test(fs.readFileSync(file, "utf8")) }))
  .sort((a, b) => Number(a.mocks) - Number(b.mocks))
  .map(({ file }) => file);

// A file that cannot be loaded has no test to carry its failure, so the file
// itself is recorded as the failing entry.
const runFile = async (t, file) => {
  try {
    await globalThis.__testHarness.runFile(t, path.resolve(file));
  } catch (error) {
    if (process.env.NT_FAILURES) fs.appendFileSync(process.env.NT_FAILURES, `${file}\t(file)\t${String(error?.message ?? error).split("\n")[0].slice(0, 200)}\n`);
    if (process.env.NT_FAILURE_DETAIL) fs.appendFileSync(process.env.NT_FAILURE_DETAIL, `\n===== ${file} > (file)\n${error?.stack ?? error}\n`);
    throw error;
  }
};

const finish = (code) => {
  // jsdom's animation frame timer and app intervals keep the event loop alive.
  // The delay lets the reporter print its summary.
  process.exitCode = code || process.exitCode || 0;
  setTimeout(() => process.exit(process.exitCode), Number(process.env.NT_EXIT_DELAY_MS ?? (queueMode ? 100 : 1500)));
};

// In queue mode the parent hands out one file at a time, so a slow file cannot
// leave the other processes idle the way a fixed split does.
let ranHere = 0;
const queueMode = process.env.NT_QUEUE === "1" && typeof process.send === "function";
const nextFromParent = () =>
  new Promise((resolve) => {
    const onMessage = (message) => {
      process.off("message", onMessage);
      resolve(message && message.file ? message.file : null);
    };
    process.on("message", onMessage);
    process.send({ ready: true });
  });

(async () => {
  if (queueMode) {
    for (;;) {
      const file = await nextFromParent();
      if (!file) break;
      await test(file, (t) => runFile(t, file));
      const { rss } = process.memoryUsage();
      // A timed-out test leaves work running that cannot be stopped, so the
      // worker is spent: exit and let the pool start a clean one, rather than
      // skipping every remaining test in this process.
      if (globalThis.__testHarness.poisoned) return finish(RECYCLE_EXIT_CODE);
      if (megabytes(rss) > MAX_RSS_MB) return finish(RECYCLE_EXIT_CODE);
      ranHere += 1;
      if (ranHere >= MAX_FILES) return finish(RECYCLE_EXIT_CODE);
    }
    return finish(0);
  }
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    // Written before the file runs: if this process dies in it, the launcher
    // names the file and carries on with the ones after it.
    if (process.env.NT_REMAINING) fs.writeFileSync(process.env.NT_REMAINING, files.slice(index + 1).join("\n") + "\n");
    if (process.env.NT_CURRENT) fs.writeFileSync(process.env.NT_CURRENT, file + "\n");
    await test(file, (t) => runFile(t, file));
    const { rss } = process.memoryUsage();
    const remaining = files.slice(index + 1);
    if (globalThis.__testHarness.poisoned && remaining.length > 0) {
      console.error(`[harness] a test timed out and its work cannot be stopped, recycling with ${remaining.length} files left`);
      return finish(RECYCLE_EXIT_CODE);
    }
    if (index + 1 >= MAX_FILES && remaining.length > 0) {
      console.error(`[harness] reached ${MAX_FILES} files, recycling with ${remaining.length} left`);
      return finish(RECYCLE_EXIT_CODE);
    }
    if (megabytes(rss) > MAX_RSS_MB && remaining.length > 0) {
      console.error(`[harness] resident size ${megabytes(rss)} MB is over ${MAX_RSS_MB} MB, recycling with ${remaining.length} files left`);
      return finish(RECYCLE_EXIT_CODE);
    }
  }
  if (process.env.NT_REMAINING) fs.rmSync(process.env.NT_REMAINING, { force: true });
  finish(0);
})();
