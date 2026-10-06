// Hands files to N harness processes as they become free, which is what jest's
// worker queue does and a fixed split cannot.
const { fork } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const [listArg, countArg] = process.argv.slice(2);
const files = fs.readFileSync(listArg.replace(/^@/, ""), "utf8").split("\n").filter(Boolean);
const workers = Number(countArg ?? 4);
const harness = path.join(__dirname, "hooks.cjs");
const runner = path.join(__dirname, "run.cjs");

let next = 0;
let live = 0;
let crashed = 0;
const started = Date.now();

const report = () => {
  console.error(
    `[pool] ${files.length} files over ${workers} workers in ${((Date.now() - started) / 1000).toFixed(1)} s, ` +
      `${crashed} worker restarts`,
  );
};

const spawn = () => {
  const child = fork(runner, [], {
    execArgv: [
      "--require", harness,
      `--max-old-space-size=${process.env.NT_HEAP_MB ?? 1536}`,
      `--test-reporter=${process.env.NT_REPORTER ?? "dot"}`,
      ...(process.env.NT_NODE_EXTRA ? process.env.NT_NODE_EXTRA.split(" ") : []),
    ],
    env: { ...process.env, NT_QUEUE: "1" },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  live += 1;
  let assigned = null;
  child.stdout.on("data", (chunk) => { if (process.env.NT_STDOUT) require("node:fs").appendFileSync(process.env.NT_STDOUT, chunk); });
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  child.on("message", (message) => {
    if (!message?.ready) return;
    assigned = next < files.length ? files[next++] : null;
    child.send(assigned ? { file: assigned } : { done: true });
  });
  child.on("exit", (code) => {
    live -= 1;
    // A worker that dies mid-file takes the rest of its queue with it unless a
    // replacement picks the queue back up. The file it died on is not retried.
    // 75 is a deliberate recycle, not a crash, but either way the queue needs a
    // replacement worker to keep draining.
    const died = code !== 0 && code !== null;
    if (died && next < files.length) {
      crashed += 1;
      spawn();
      return;
    }
    if (live === 0) report();
  });
};

for (let index = 0; index < workers; index += 1) spawn();
