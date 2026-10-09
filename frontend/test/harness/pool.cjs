// Hands files to N harness processes as they become free, which is what jest's
// worker queue does and a fixed split cannot.
const { fork, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

// jest runs each project with its own setup files. A worker loads one
// project's setup when it starts, so each worker serves one project, and the
// pool moves workers to whichever project has files left.
const { root, projects, projectOf } = require("./jest-config.cjs");

const harness = path.join(__dirname, "hooks.cjs");
const runner = path.join(__dirname, "run.cjs");
const cacheDir = path.join(root, "node_modules/.cache/test-harness");
const MAX_STARTUP_FAILURES = 5;

// One worker per fast core. An Apple chip also reports its efficiency cores, and
// workers on those only add timeouts.
const fastCores = () => {
  if (process.platform === "darwin") {
    try { return Number(execFileSync("sysctl", ["-n", "hw.perflevel0.physicalcpu"], { encoding: "utf8" })); } catch {}
  }
  return require("node:os").availableParallelism();
};

// The slowest files go first. Taken in list order, a 20 second file can be the
// last one picked up, and then one worker runs it while the others sit idle.
// The times come from the previous run, and a file with no record goes first.
const durationsFile = path.join(cacheDir, "durations.json");
// A machine with no run behind it, such as a CI runner, starts from the times
// that are checked in. They are from another machine, but the order holds.
const seedDurationsFile = path.join(__dirname, "durations.json");
const readDurations = () => {
  for (const file of [durationsFile, seedDurationsFile]) {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
  }
  return {};
};

// keepAlive holds idle workers for the next run() instead of ending them, which
// is what makes a rerun in watch mode start warm.
const createPool = ({ workers = fastCores(), keepAlive = false, env = {}, onFileDone = () => {} } = {}) => {
  const durations = readDurations();
  const queues = Object.fromEntries(projects.map(({ name }) => [name, []]));
  const serving = Object.fromEntries(projects.map(({ name }) => [name, 0]));
  const idle = Object.fromEntries(projects.map(({ name }) => [name, []]));
  // Workers that have started and not yet asked for their first file.
  const starting = Object.fromEntries(projects.map(({ name }) => [name, 0]));
  // Files changed since the pool started. A worker is told about the ones it has
  // not heard of when it gets its next file, so it reads them again.
  const changes = [];
  let live = 0;
  let crashed = 0;
  let startupFailures = 0;
  let pending = 0;
  let closing = false;
  let settle = null;

  const saveDurations = () => {
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(durationsFile, JSON.stringify(durations));
    } catch {}
  };
  const finished = () => {
    pending -= 1;
    if (pending === 0 && settle) {
      saveDurations();
      const done = settle;
      settle = null;
      done({ crashed });
    }
  };

  // The project with the most files left for each worker it already has. A
  // project whose waiting files all have a worker on its way needs no more.
  const neediest = () => {
    let best = null;
    for (const name of Object.keys(queues)) {
      if (queues[name].length <= starting[name]) continue;
      const load = queues[name].length / (serving[name] + 1);
      if (!best || load > best.load) best = { name, load };
    }
    return best?.name ?? null;
  };

  const assign = (worker) => {
    const file = queues[worker.project].shift();
    if (!file) {
      // An idle worker of one project gives its slot to a project with work.
      if (keepAlive && !closing && !neediest()) { idle[worker.project].push(worker); return; }
      worker.child.send({ done: true });
      return;
    }
    worker.running = { file, since: Date.now() };
    worker.child.send({ file, changed: changes.slice(worker.changesSeen) });
    worker.changesSeen = changes.length;
  };

  const spawn = (project) => {
    const child = fork(runner, [], {
      execArgv: [
        "--require", harness,
        "--no-deprecation",
        `--max-old-space-size=${process.env.NT_HEAP_MB ?? 1536}`,
        // React tests allocate fast and drop most of it at once, so a larger young
        // generation saves many small collections.
        `--max-semi-space-size=${process.env.NT_SEMI_SPACE_MB ?? 32}`,
        `--test-reporter=${process.env.NT_REPORTER ?? "dot"}`,
        ...(process.env.NT_NODE_EXTRA ? process.env.NT_NODE_EXTRA.split(" ") : []),
      ],
      env: { ...process.env, ...env, NT_QUEUE: "1", NT_PROJECT: project },
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    const worker = { child, project, running: null, changesSeen: changes.length, started: false };
    starting[project] += 1;
    live += 1;
    serving[project] += 1;
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.on("message", (message) => {
      if (!message?.ready) return;
      startupFailures = 0;
      if (!worker.started) { worker.started = true; starting[project] -= 1; }
      if (worker.running) {
        const { file, since } = worker.running;
        worker.running = null;
        durations[file] = Date.now() - since;
        onFileDone({ file, ms: durations[file], loaded: message.loaded ?? [] });
        finished();
      }
      assign(worker);
    });
    child.on("exit", (code) => {
      fs.rmSync(path.join(cacheDir, `process-${child.pid}`), { recursive: true, force: true });
      live -= 1;
      serving[project] -= 1;
      idle[project] = idle[project].filter((other) => other !== worker);
      if (!worker.started) starting[project] -= 1;
      // 75 is a deliberate recycle, anything else non-zero is a crash.
      if (code !== 0 && code !== null) crashed += 1;
      // A worker that died in a file took the file's results with it. The file
      // is not run again, so it is recorded as failed.
      if (worker.running) {
        const { file } = worker.running;
        worker.running = null;
        const failures = env.NT_FAILURES ?? process.env.NT_FAILURES;
        if (failures) fs.appendFileSync(failures, `${file}\t(file)\tthe worker exited with code ${code} while this file ran\n`);
        onFileDone({ file, ms: 0, loaded: [], crashed: true });
        finished();
      }
      // A worker that dies before it asks for a file would die again on respawn.
      if (code !== 0 && code !== 75 && (startupFailures += 1) > MAX_STARTUP_FAILURES) {
        console.error(`[pool] ${startupFailures} workers in a row died before they took a file, giving up`);
        process.exit(1);
      }
      fill();
    });
  };

  // Puts idle workers to work and starts new ones while there is room.
  const fill = () => {
    if (closing) return;
    for (const name of Object.keys(queues)) {
      while (queues[name].length > 0 && idle[name].length > 0) assign(idle[name].pop());
    }
    for (;;) {
      const name = neediest();
      if (!name) return;
      if (live < workers) { spawn(name); continue; }
      const spare = Object.values(idle).find((list) => list.length > 0);
      if (!spare) return;
      spare.pop().child.send({ done: true });
      return;
    }
  };

  return {
    workers,
    run(files) {
      return new Promise((resolve) => {
        if (files.length === 0) { resolve({ crashed }); return; }
        settle = resolve;
        for (const file of files) {
          const project = projectOf(file);
          if (!project) throw new Error(`${file} is in no jest project`);
          queues[project.name].push(file);
          pending += 1;
        }
        for (const queue of Object.values(queues)) queue.sort((a, b) => (durations[b] ?? Infinity) - (durations[a] ?? Infinity));
        fill();
      });
    },
    changed(files) { changes.push(...files); },
    // Ends every worker. Workers that are idle exit now, busy ones after their file.
    close() {
      closing = true;
      for (const list of Object.values(idle)) for (const worker of list.splice(0)) worker.child.send({ done: true });
    },
  };
};

module.exports = { createPool, fastCores };

// node pool.cjs <list file> [workers]: runs the listed files once.
if (require.main === module) {
  const [listArg, countArg] = process.argv.slice(2);
  const files = fs.readFileSync(listArg.replace(/^@/, ""), "utf8").split("\n").filter(Boolean);
  const pool = createPool({ workers: countArg ? Number(countArg) : undefined });
  const started = Date.now();
  pool.run(files).then(({ crashed }) => {
    console.error(`[pool] ${files.length} files over ${pool.workers} workers in ${((Date.now() - started) / 1000).toFixed(1)} s, ${crashed} worker restarts`);
  });
}
