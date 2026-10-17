// A worker process of the pool. It prepares a jest-like environment once, then
// runs the spec files that the pool hands it, one at a time, until it is told
// to stop or decides that it is spent.
import { createRequire } from "node:module";
import path from "node:path";
import { type TestContext, test } from "node:test";

import { root } from "../jest-config.ts";
import {
  type MessageFromWorker,
  type MessageToWorker,
  RECYCLE_EXIT_CODE,
} from "../types.ts";

import { installTestGlobals } from "./collect.ts";
import { installDom } from "./dom.ts";
import { ignoreUnmatchedCallsAfterBody } from "./fetch-mock.ts";
import { startFileLog } from "./file-log.ts";
import { installJestObject } from "./jest-object.ts";
import { prepareMocks } from "./mocks.ts";
import { registerModuleHooks } from "./module-hooks.ts";
import { watchPackageLoading } from "./package-loading.ts";
import { project } from "./project.ts";
import { recordEnvironmentBaseline, recordRealmBaseline } from "./realm.ts";
import { forgetResolvedFiles } from "./resolve.ts";
import { captureConsole, recordFailure, takeFileResult } from "./results.ts";
import {
  captureUncaughtExceptions,
  runFile,
  setRepositoryReset,
} from "./run-file.ts";
import { loadRepositoryReset, runSetupFiles } from "./setup-files.ts";
import {
  rememberCanvasMocks,
  resetTestingLibraryConfig,
} from "./shared-packages.ts";
import { createFakeClock, isPoisoned, trackTimers } from "./timers.ts";
import { forgetTransformed, takeLoadedFiles } from "./transform.ts";

const MAX_RESIDENT_MB = Number(process.env.NT_MAX_RSS_MB ?? 1500);
const MAX_FILES = Number(process.env.NT_MAX_FILES ?? Infinity);
// jsdom's animation frame timer and the app's intervals keep the event loop
// alive, so the worker exits explicitly, after node:test has reported.
const EXIT_DELAY_MS = Number(process.env.NT_EXIT_DELAY_MS ?? 100);

installEnvironment();
void runFilesFromPool();

// The order matters: each step depends on the ones before it.
function installEnvironment(): void {
  startFileLog();
  prepareMocks();
  registerModuleHooks();
  captureConsole();
  installDom();
  captureUncaughtExceptions();
  installTestGlobals();
  createFakeClock();
  installJestObject();
  Object.assign(globalThis, structuredClone(project.globals));
  watchPackageLoading();
  loadSchedulerWithRealTimers();
  trackTimers();
  runSetupFiles();
  recordRealmBaseline();
  recordEnvironmentBaseline();
  setRepositoryReset(loadRepositoryReset());
  ignoreUnmatchedCallsAfterBody();
  resetTestingLibraryConfig();
  rememberCanvasMocks();
}

// React's scheduler keeps the timer functions it finds when it loads. It is
// one copy for the whole process, so it has to find Node's own: a tracked
// timer of its would be cleared at the end of a file, and the scheduler would
// go on believing that its callback is still due.
function loadSchedulerWithRealTimers(): void {
  const requireFromRoot = createRequire(path.join(root, "package.json"));
  createRequire(requireFromRoot.resolve("react-dom"))("scheduler");
}

async function runFilesFromPool(): Promise<void> {
  let filesRun = 0;
  for (;;) {
    const file = await nextFile();
    if (!file) {
      return exit(0);
    }
    await test(file, (t) => runFileOrRecordFailure(t, file));
    // The result goes back before anything else, so that a worker that is
    // about to stop does not take it along.
    send({
      type: "finished",
      loaded: takeLoadedFiles(),
      result: takeFileResult(),
    });
    filesRun += 1;
    if (
      isPoisoned() ||
      residentMb() > MAX_RESIDENT_MB ||
      filesRun >= MAX_FILES
    ) {
      return exit(RECYCLE_EXIT_CODE);
    }
  }
}

// A file that cannot be loaded has no test to carry its failure, so the file
// itself is recorded as failed.
async function runFileOrRecordFailure(
  t: TestContext,
  file: string,
): Promise<void> {
  try {
    await runFile(t, path.resolve(file));
  } catch (error) {
    recordFailure("(the file did not load)", error, "");
    throw error;
  }
}

function nextFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const onMessage = (message: MessageToWorker) => {
      process.off("message", onMessage);
      if (message.type === "stop") {
        resolve(null);
        return;
      }
      if (message.changed.length > 0) {
        forgetTransformed(message.changed);
        forgetResolvedFiles();
      }
      resolve(message.file);
    };
    process.on("message", onMessage);
    send({ type: "ready" });
  });
}

function send(message: MessageFromWorker): void {
  process.send?.(message);
}

function residentMb(): number {
  return Math.round(process.memoryUsage().rss / 1024 / 1024);
}

function exit(code: number): void {
  process.exitCode = code;
  setTimeout(() => process.exit(code), EXIT_DELAY_MS);
}
