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

// jest runs the SDK specs as a project of their own, with different setup files.
// A worker loads one project's setup when it starts, so each worker serves one
// project, and the pool moves workers to whichever project has files left.
const SDK_PROJECT = /^(frontend\/src\/embedding-sdk-(bundle|shared)|enterprise\/frontend\/src\/embedding-sdk-(package|ee))\//;
const projectOf = (file) => (process.env.NT_ONE_PROJECT !== "1" && SDK_PROJECT.test(path.relative(path.resolve(__dirname, ".."), path.resolve(file))) ? "sdk" : "core");
const queues = { core: [], sdk: [] };
for (const file of files) queues[projectOf(file)].push(file);
const serving = { core: 0, sdk: 0 };

let live = 0;
let crashed = 0;
let startupFailures = 0;
const MAX_STARTUP_FAILURES = 5;
const started = Date.now();

const report = () => {
  console.error(
    `[pool] ${files.length} files over ${workers} workers in ${((Date.now() - started) / 1000).toFixed(1)} s, ` +
      `${crashed} worker restarts`,
  );
};

// The project with the most files left for each worker it already has.
const neediest = () => {
  let best = null;
  for (const project of Object.keys(queues)) {
    if (queues[project].length === 0) continue;
    const load = queues[project].length / (serving[project] + 1);
    if (!best || load > best.load) best = { project, load };
  }
  return best?.project ?? null;
};

const spawn = (project) => {
  const child = fork(runner, [], {
    execArgv: [
      "--require", harness,
      `--max-old-space-size=${process.env.NT_HEAP_MB ?? 1536}`,
      `--test-reporter=${process.env.NT_REPORTER ?? "dot"}`,
      ...(process.env.NT_NODE_EXTRA ? process.env.NT_NODE_EXTRA.split(" ") : []),
    ],
    env: { ...process.env, NT_QUEUE: "1", NT_PROJECT: project },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  live += 1;
  serving[project] += 1;
  child.stdout.on("data", (chunk) => { if (process.env.NT_STDOUT) require("node:fs").appendFileSync(process.env.NT_STDOUT, chunk); });
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  child.on("message", (message) => {
    if (!message?.ready) return;
    startupFailures = 0;
    const assigned = queues[project].shift();
    child.send(assigned ? { file: assigned } : { done: true });
  });
  child.on("exit", (code) => {
    fs.rmSync(path.join(__dirname, "../node_modules/.cache/node-test-spike", `process-${child.pid}`), { recursive: true, force: true });
    live -= 1;
    serving[project] -= 1;
    // 75 is a deliberate recycle, anything else non-zero is a crash. The file a
    // worker died on is not retried. Either way the slot goes to the project
    // that now needs it most.
    if (code !== 0 && code !== null) crashed += 1;
    // A worker that dies before it asks for a file would die again on respawn.
    if (code !== 0 && code !== 75 && (startupFailures += 1) > MAX_STARTUP_FAILURES) {
      console.error(`[pool] ${startupFailures} workers in a row died before they took a file, giving up`);
      process.exit(1);
    }
    const nextProject = neediest();
    if (nextProject) spawn(nextProject);
    else if (live === 0) report();
  });
};

for (let index = 0; index < workers; index += 1) {
  const project = neediest();
  if (project) spawn(project);
}
