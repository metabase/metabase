// Hands spec files to worker processes as they become free, which is what
// jest's worker queue does and a fixed split cannot.
import { type ChildProcess, execFileSync, fork } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { projectOf, projects, root } from "./jest-config.ts";
import {
  type FileDone,
  type FileResult,
  type FileStarted,
  type MessageFromWorker,
  type MessageToWorker,
  RECYCLE_EXIT_CODE,
} from "./types.ts";

export type PoolOptions = {
  workers?: number;
  /**
   * Holds idle workers for the next run() instead of ending them, which is
   * what makes a rerun in watch mode start warm.
   */
  keepAlive?: boolean;
  env?: NodeJS.ProcessEnv;
  onFileStart?: (started: FileStarted) => void;
  onFileDone?: (done: FileDone) => void;
};

export type Pool = {
  workers: number;
  run(files: string[]): Promise<{ crashed: number }>;
  /**
   * Tells the workers that these files changed, before their next spec file.
   */
  changed(files: string[]): void;
  /**
   * Drops the files that no worker has taken yet. Running files finish.
   */
  stop(): void;
  /**
   * Replaces every worker, for a change to something that a worker loads only
   * once, such as a package or a build output.
   */
  restart(): void;
  /**
   * Ends every worker. Idle workers exit now, busy ones after their file.
   */
  close(): void;
};

type Worker = {
  child: ChildProcess;
  /**
   * The jest project whose files the worker runs.
   */
  projectName: string;
  running: { file: string; since: number } | null;
  changesSeen: number;
  started: boolean;
  generation: number;
};

const WORKER_ENTRY = path.join(import.meta.dirname, "worker", "main.ts");
const CACHE_DIRECTORY = path.join(root, "node_modules/.cache/test-harness");
const DURATIONS_FILE = path.join(CACHE_DIRECTORY, "durations.json");
// A machine with no run behind it starts from the times that are checked in.
const SEED_DURATIONS_FILE = path.join(import.meta.dirname, "durations.json");
const DEFAULT_DURATION_MS = 500;
const MAX_STARTUP_FAILURES = 5;

/**
 * One worker per fast core. An Apple chip also reports its efficiency cores,
 * and workers on those only add timeouts.
 */
export function fastCores(): number {
  if (process.platform === "darwin") {
    try {
      return Number(
        execFileSync("sysctl", ["-n", "hw.perflevel0.physicalcpu"], {
          encoding: "utf8",
        }),
      );
    } catch {
      // An Intel Mac has no such value, and the count that Node reports is right.
    }
  }
  return os.availableParallelism();
}

const knownDurations = readDurations();

/**
 * How long a file took the last time it ran, for the estimate in the progress
 * line.
 */
export function estimateDuration(file: string): number {
  return (
    knownDurations[path.relative(root, file)] ??
    knownDurations[file] ??
    DEFAULT_DURATION_MS
  );
}

export function createPool({
  workers = fastCores(),
  keepAlive = false,
  env = {},
  onFileStart = () => {},
  onFileDone = () => {},
}: PoolOptions = {}): Pool {
  const durations = readDurations();
  const projectNames = projects.map(({ name }) => name);
  const queues = byProject<string[]>(projectNames, () => []);
  const idle = byProject<Worker[]>(projectNames, () => []);
  const serving = byProject(projectNames, () => 0);
  // Workers that have started and not yet asked for their first file.
  const starting = byProject(projectNames, () => 0);
  // Files changed since the pool started. A worker hears of the ones that are
  // new to it with its next file, and reads them again.
  const changes: string[] = [];
  let live = 0;
  let crashed = 0;
  let startupFailures = 0;
  let pending = 0;
  let closing = false;
  let settle: ((result: { crashed: number }) => void) | null = null;
  // Raised by restart(). A worker from before is ended, not given a file.
  let generation = 0;

  const finished = (count = 1) => {
    pending -= count;
    if (pending === 0 && settle) {
      saveDurations(durations);
      const done = settle;
      settle = null;
      done({ crashed });
    }
  };

  // The project with the most files left for each worker it already has. A
  // project whose waiting files all have a worker on the way needs no more.
  const neediestProject = (): string | null => {
    let neediest: { name: string; load: number } | null = null;
    for (const name of projectNames) {
      if (queues[name].length <= starting[name]) {
        continue;
      }
      const load = queues[name].length / (serving[name] + 1);
      if (!neediest || load > neediest.load) {
        neediest = { name, load };
      }
    }
    return neediest?.name ?? null;
  };

  const send = (worker: Worker, message: MessageToWorker) =>
    worker.child.send(message);

  const assign = (worker: Worker) => {
    if (worker.generation !== generation) {
      send(worker, { type: "stop" });
      return;
    }
    const file = queues[worker.projectName].shift();
    if (!file) {
      // An idle worker of one project gives its slot to a project with work.
      if (keepAlive && !closing && !neediestProject()) {
        idle[worker.projectName].push(worker);
      } else {
        send(worker, { type: "stop" });
      }
      return;
    }
    worker.running = { file, since: Date.now() };
    onFileStart({ file });
    send(worker, {
      type: "run",
      file,
      changed: changes.slice(worker.changesSeen),
    });
    worker.changesSeen = changes.length;
  };

  const onMessage = (worker: Worker, message: MessageFromWorker) => {
    if (message.type === "finished") {
      if (!worker.running) {
        return;
      }
      const { file, since } = worker.running;
      worker.running = null;
      durations[file] = Date.now() - since;
      onFileDone({
        file,
        durationMs: durations[file],
        loaded: message.loaded,
        result: message.result,
      });
      finished();
      return;
    }
    startupFailures = 0;
    if (!worker.started) {
      worker.started = true;
      starting[worker.projectName] -= 1;
    }
    assign(worker);
  };

  const onExit = (worker: Worker, code: number | null) => {
    fs.rmSync(path.join(CACHE_DIRECTORY, `process-${worker.child.pid}`), {
      recursive: true,
      force: true,
    });
    live -= 1;
    serving[worker.projectName] -= 1;
    idle[worker.projectName] = idle[worker.projectName].filter(
      (other) => other !== worker,
    );
    if (!worker.started) {
      starting[worker.projectName] -= 1;
    }
    if (code !== 0 && code !== null) {
      crashed += 1;
    }
    // A worker that died in a file took the file's results with it. The file
    // does not run again, so it counts as failed.
    if (worker.running) {
      const { file } = worker.running;
      worker.running = null;
      onFileDone({
        file,
        durationMs: 0,
        loaded: [],
        result: crashResult(code),
      });
      finished();
    }
    // A worker that dies before it asks for a file would die again.
    if (code !== 0 && code !== RECYCLE_EXIT_CODE) {
      startupFailures += 1;
      if (startupFailures > MAX_STARTUP_FAILURES) {
        console.error(
          `[pool] ${startupFailures} workers in a row died before they took a file, giving up`,
        );
        process.exit(1);
      }
    }
    fill();
  };

  const spawn = (projectName: string) => {
    const settings = { ...process.env, ...env };
    const child = fork(WORKER_ENTRY, [], {
      execArgv: workerArguments(settings),
      env: {
        ...settings,
        NODE_ENV: "test",
        JEST_WORKER_ID: settings.JEST_WORKER_ID ?? "1",
        NT_PROJECT: projectName,
      },
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    const worker: Worker = {
      child,
      projectName,
      running: null,
      changesSeen: changes.length,
      started: false,
      generation,
    };
    starting[projectName] += 1;
    serving[projectName] += 1;
    live += 1;
    child.stderr?.on("data", (chunk) => process.stderr.write(chunk));
    child.on("message", (message: MessageFromWorker) =>
      onMessage(worker, message),
    );
    child.on("exit", (code) => onExit(worker, code));
  };

  // Puts idle workers to work and starts new ones while there is room.
  const fill = () => {
    if (closing) {
      return;
    }
    for (const name of projectNames) {
      while (queues[name].length > 0 && idle[name].length > 0) {
        const worker = idle[name].pop();
        if (worker) {
          assign(worker);
        }
      }
    }
    const name = neediestProject();
    if (!name) {
      return;
    }
    if (live < workers) {
      spawn(name);
      fill();
      return;
    }
    // A full pool frees a slot from a project that has no work.
    const spare = projectNames
      .map((other) => idle[other])
      .find((list) => list.length > 0);
    spare?.pop()?.child.send({ type: "stop" } satisfies MessageToWorker);
  };

  const stopIdleWorkers = () => {
    for (const name of projectNames) {
      for (const worker of idle[name].splice(0)) {
        send(worker, { type: "stop" });
      }
    }
  };

  return {
    workers,
    run(files) {
      return new Promise((resolve) => {
        if (files.length === 0) {
          resolve({ crashed });
          return;
        }
        settle = resolve;
        for (const file of files) {
          const project = projectOf(file);
          if (!project) {
            throw new Error(`${file} is in no jest project`);
          }
          queues[project.name].push(file);
          pending += 1;
        }
        fill();
      });
    },
    changed(files) {
      changes.push(...files);
    },
    stop() {
      let dropped = 0;
      for (const name of projectNames) {
        dropped += queues[name].splice(0).length;
      }
      if (dropped > 0) {
        finished(dropped);
      }
    },
    restart() {
      generation += 1;
      stopIdleWorkers();
    },
    close() {
      closing = true;
      stopIdleWorkers();
    },
  };
}

function workerArguments(settings: NodeJS.ProcessEnv): string[] {
  return [
    "--no-deprecation",
    `--max-old-space-size=${settings.NT_HEAP_MB ?? 1536}`,
    // React tests allocate fast and drop most of it at once, so a larger
    // young generation saves many small collections. 64 MB is about 2% faster
    // than 32 on a CI runner, and 128 gains no more.
    `--max-semi-space-size=${settings.NT_SEMI_SPACE_MB ?? 64}`,
    `--test-reporter=${settings.NT_REPORTER ?? "dot"}`,
    // Results travel over the IPC channel. node:test's own report would go
    // through process.stdout.write, where a spec that spies on it sees it.
    ...(settings.NT_REPORTER
      ? []
      : [`--test-reporter-destination=${os.devNull}`]),
    ...(settings.NT_NODE_EXTRA ? settings.NT_NODE_EXTRA.split(" ") : []),
  ];
}

function crashResult(code: number | null): FileResult {
  return {
    passed: 0,
    failed: 1,
    skipped: 0,
    passedTests: [],
    skippedTests: [],
    failures: [
      {
        test: "(the worker crashed)",
        message: `the worker exited with code ${code} while this file ran`,
        stack: "",
        frames: [],
        output: "",
      },
    ],
  };
}

function byProject<T>(names: string[], initial: () => T): Record<string, T> {
  return Object.fromEntries(names.map((name) => [name, initial()]));
}

function readDurations(): Record<string, number> {
  for (const file of [DURATIONS_FILE, SEED_DURATIONS_FILE]) {
    try {
      const durations: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
      if (typeof durations === "object" && durations !== null) {
        return Object.fromEntries(
          Object.entries(durations).filter(
            (entry): entry is [string, number] => typeof entry[1] === "number",
          ),
        );
      }
    } catch {
      // No file yet, or one that a stopped run left half written.
    }
  }
  return {};
}

function saveDurations(durations: Record<string, number>): void {
  try {
    fs.mkdirSync(CACHE_DIRECTORY, { recursive: true });
    fs.writeFileSync(DURATIONS_FILE, JSON.stringify(durations));
  } catch {
    // The times only feed the estimate of the next run.
  }
}
