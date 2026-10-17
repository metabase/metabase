// Hands spec files to worker processes as they become free, which is what
// jest's worker queue does and a fixed split cannot.
import { type ChildProcess, fork } from "node:child_process";
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
  workers: number;
  env?: NodeJS.ProcessEnv;
  onFileStart?: (started: FileStarted) => void;
  onFileDone?: (done: FileDone) => void;
};

export type Pool = {
  workers: number;
  run(files: string[]): Promise<{ crashed: number }>;
  /**
   * Drops the files that no worker has taken yet. Running files finish.
   */
  stop(): void;
  /**
   * Starts no more workers. Each worker exits after its file.
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
  started: boolean;
};

const WORKER_ENTRY = path.join(import.meta.dirname, "worker", "main.ts");
const CACHE_DIRECTORY = path.join(root, "node_modules/.cache/test-harness");
const MAX_STARTUP_FAILURES = 5;

export function createPool({
  workers,
  env = {},
  onFileStart = () => {},
  onFileDone = () => {},
}: PoolOptions): Pool {
  const projectNames = projects.map(({ name }) => name);
  const queues = byProject<string[]>(projectNames, () => []);
  const serving = byProject(projectNames, () => 0);
  // Workers that have started and not yet asked for their first file.
  const starting = byProject(projectNames, () => 0);
  let live = 0;
  let crashed = 0;
  let startupFailures = 0;
  let pending = 0;
  let closing = false;
  let settle: ((result: { crashed: number }) => void) | null = null;

  const finished = (count = 1) => {
    pending -= count;
    if (pending === 0 && settle) {
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

  // A worker with no file left in its project ends, which frees its slot for
  // a project with work.
  const assign = (worker: Worker) => {
    const file = queues[worker.projectName].shift();
    if (!file) {
      send(worker, { type: "stop" });
      return;
    }
    worker.running = { file, since: Date.now() };
    onFileStart({ file });
    send(worker, { type: "run", file });
  };

  const onMessage = (worker: Worker, message: MessageFromWorker) => {
    if (message.type === "finished") {
      if (!worker.running) {
        return;
      }
      const { file, since } = worker.running;
      worker.running = null;
      onFileDone({
        file,
        durationMs: Date.now() - since,
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
      onFileDone({ file, durationMs: 0, result: crashResult(code) });
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
      started: false,
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

  // Starts workers while there is room and a project that needs one.
  const fill = () => {
    while (!closing && live < workers) {
      const name = neediestProject();
      if (!name) {
        return;
      }
      spawn(name);
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
    stop() {
      let dropped = 0;
      for (const name of projectNames) {
        dropped += queues[name].splice(0).length;
      }
      if (dropped > 0) {
        finished(dropped);
      }
    },
    close() {
      closing = true;
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
