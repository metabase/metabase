// Runs one spec file: collects its tests, runs them as node:test subtests in
// jest's order with jest's hooks, and then resets the worker for the next file.
import { createRequire } from "node:module";
import path from "node:path";
import type { TestContext } from "node:test";

import { root, testTimeoutMs } from "../jest-config.ts";

import {
  type Hooks,
  type Suite,
  type TestFunction,
  type TestNode,
  collect,
  createSuite,
  forgetPackageHooks,
  fullName,
  packageHooks,
  rootSuite,
  selectTests,
  testsIn,
} from "./collect.ts";
import { currentWindow, replaceWindow } from "./dom.ts";
import {
  clearCallHistory,
  dropUnmatchedCalls,
  flushAndRemoveRoutes,
  removeRoutes,
  setTestPhase,
} from "./fetch-mock.ts";
import { logFile } from "./file-log.ts";
import {
  finishSnapshots,
  moduleMocker,
  setCurrentTestName,
  startSnapshots,
} from "./jest-object.ts";
import { recordSetupMocks, resetMocksForNextFile } from "./mocks.ts";
import { evictModules, evictProjectModules } from "./module-cache.ts";
import {
  WINDOW_BOUND_PACKAGES,
  mirrorGlobalsAgain,
  restoreSharedPackages,
} from "./package-loading.ts";
import { globals, tryTo } from "./properties.ts";
import {
  recordRealmBaseline,
  restoreEnvironment,
  restoreRealm,
} from "./realm.ts";
import {
  recordFailure,
  recordPassed,
  recordSkipped,
  startTestOutput,
  takeTestOutput,
} from "./results.ts";
import { restoreSetupMocks, runSetupFiles } from "./setup-files.ts";
import {
  rememberCanvasMocks,
  resetClipboard,
  resetFocus,
  restoreCanvasMocks,
} from "./shared-packages.ts";
import {
  TestTimeoutError,
  clearPendingTimers,
  fakeClock,
  isPoisoned,
  restoreTimerGlobals,
  trackTimers,
  withDeadline,
} from "./timers.ts";

type HookChain = Pick<Hooks, "beforeEach" | "afterEach">;
type Failure = { error: unknown };

const TEST_TIMEOUT_MS = Number(process.env.NT_TIMEOUT ?? testTimeoutMs ?? 5000);
const HOOK_TIMEOUT_MS = Number(process.env.NT_HOOK_TIMEOUT ?? 8000);
// The body's own deadline is shorter than node:test's, so that the runner's
// error, with its cleanup, comes first.
const BODY_SHARE_OF_TIMEOUT = 0.9;

// fetch-mock cancels an aborted request's body from an AbortSignal handler,
// and undici has already locked that stream, so the error arrives
// asynchronously. jest's jsdom reports it to the console.
const FETCH_MOCK_ABORT_RACE = /locked for exclusive reading/;

const require = createRequire(import.meta.url);

let repositoryReset: () => void = () => {};
let pendingUncaught: Failure | null = null;
// React Testing Library switches React's act environment flag on for a file,
// then off and back on around each waitFor. An async act that a waitFor did
// not wait for restores the "off" it saw when it started, whenever it
// completes. When that lands after the waitFor has returned, the flag stays
// off for the rest of the file. So each test starts with the value the file
// was given.
let actEnvironmentForFile: unknown;

export function setRepositoryReset(reset: () => void): void {
  repositoryReset = reset;
}

/**
 * node:test fails the running test on an uncaught exception and moves on
 * while the runner is still cleaning it up, so the cleanup would land inside
 * later tests. The error is kept instead, and reported as the failure of the
 * test that is running.
 */
export function captureUncaughtExceptions(): void {
  process.setUncaughtExceptionCaptureCallback((error) => {
    if (FETCH_MOCK_ABORT_RACE.test(String(error?.message ?? error))) {
      return;
    }
    pendingUncaught ??= { error };
  });
}

export async function runFile(t: TestContext, file: string): Promise<void> {
  const startedAt = Date.now();
  recordSetupMocks();
  startSnapshots(file);
  evictProjectModules();
  runSetupFiles();

  const fileSuite = createSuite(file, "run");
  collect(fileSuite, () => require(file));
  selectTests(fileSuite);
  try {
    await runFileSuite(t, fileSuite);
  } finally {
    logFile(path.relative(root, file), startedAt);
    await resetForNextFile();
  }
}

async function runFileSuite(t: TestContext, fileSuite: Suite): Promise<void> {
  for (const fn of [...packageHooks.beforeAll, ...rootSuite.beforeAll]) {
    await fn();
  }
  actEnvironmentForFile = globals.IS_REACT_ACT_ENVIRONMENT;
  try {
    if (fileSuite.mode === "skip") {
      recordSkipped(testsIn(fileSuite));
    } else {
      await runSuite(t, fileSuite, {
        isFileLevel: true,
        beforeEach: [...packageHooks.beforeEach, ...rootSuite.beforeEach],
        afterEach: [...packageHooks.afterEach, ...rootSuite.afterEach],
      });
    }
  } finally {
    for (const fn of [...rootSuite.afterAll, ...packageHooks.afterAll]) {
      try {
        await fn();
      } catch {
        // jest reports a failing afterAll of the root block on the file, which
        // has run its tests already.
      }
    }
  }
}

async function runSuite(
  t: TestContext,
  suite: Suite,
  outer: HookChain & { isFileLevel: boolean },
): Promise<void> {
  // A hook at the top level of a spec file is in jest's root block, together
  // with the setup files' hooks and after them. Only hooks inside a describe
  // block form a nested block, whose afterEach runs before its parent's.
  const hooks: HookChain = {
    beforeEach: [...outer.beforeEach, ...suite.beforeEach],
    afterEach: outer.isFileLevel
      ? [...outer.afterEach, ...suite.afterEach]
      : [...suite.afterEach, ...outer.afterEach],
  };
  for (const fn of suite.beforeAll) {
    await fn();
  }
  for (const child of suite.children) {
    if (child.type === "suite") {
      const skip = child.suite.mode === "skip";
      if (skip) {
        recordSkipped(testsIn(child.suite));
      }
      await t.test(child.suite.name, { skip }, (nested) =>
        runSuite(nested, child.suite, { ...hooks, isFileLevel: false }),
      );
      continue;
    }
    // A test that outlived its deadline is still running and still writing
    // to the shared registries, so every test after it in this worker is
    // skipped rather than scored against that mess.
    const skip = isPoisoned() || child.mode === "skip";
    const todo = child.mode === "todo";
    if (skip || todo) {
      recordSkipped([{ ancestors: child.path, title: child.name }]);
      await t.test(child.name, { skip, todo }, () => {});
      continue;
    }
    await t.test(
      child.name,
      { timeout: child.timeoutMs ?? TEST_TIMEOUT_MS },
      () => runTest(child, hooks),
    );
  }
  for (const fn of suite.afterAll) {
    await fn();
  }
  releaseSuite(suite, hooks);
}

async function runTest(test: TestNode, hooks: HookChain): Promise<void> {
  startTestOutput();
  if (actEnvironmentForFile !== undefined) {
    globals.IS_REACT_ACT_ENVIRONMENT = actEnvironmentForFile;
  }
  setCurrentTestName(fullName(test, " "));

  let failure = await runBeforeEachAndBody(test, hooks.beforeEach);
  setTestPhase("afterEach");
  for (const fn of hooks.afterEach) {
    // A hook that never settles would skip every cleanup after it, and the
    // routes and timers it leaves behind would fail the following tests.
    try {
      await withDeadline(fn, HOOK_TIMEOUT_MS);
    } catch (error) {
      failure ??= { error };
    }
  }
  tryTo(() => {
    removeRoutes();
    setTestPhase("between");
  });
  if (pendingUncaught) {
    failure ??= pendingUncaught;
    pendingUncaught = null;
  }

  const output = takeTestOutput();
  const identity = { ancestors: test.path, title: test.name };
  if (!failure) {
    recordPassed(identity);
    return;
  }
  recordFailure(fullName(test, " > "), failure.error, output, identity);
  throw failure.error;
}

async function runBeforeEachAndBody(
  test: TestNode,
  beforeEach: TestFunction[],
): Promise<Failure | null> {
  try {
    tryTo(clearCallHistory);
    setTestPhase("beforeEach");
    for (const fn of beforeEach) {
      await withDeadline(fn, HOOK_TIMEOUT_MS);
    }
    tryTo(dropUnmatchedCalls);
    setTestPhase("body");
    const body = test.fn ?? (() => {});
    await withDeadline(
      body,
      Math.round((test.timeoutMs ?? TEST_TIMEOUT_MS) * BODY_SHARE_OF_TIMEOUT),
    );
    setTestPhase("afterBody");
    return null;
  } catch (error) {
    setTestPhase("afterBody");
    // A body that ran out of time keeps running. Under a fake clock that
    // advances in real time it also keeps allocating, so its timers go and
    // the real clock comes back before the next test. Any other failure
    // leaves the clock alone, as jest does: a spec may have set it once in
    // beforeAll.
    if (error instanceof TestTimeoutError) {
      tryTo(() => fakeClock().clearAllTimers());
      fakeClock().useRealTimers();
    }
    return { error };
  }
}

// node:test keeps every test it ran until the process ends, and with it the
// callbacks of this tree. Emptied, they no longer hold the spec's functions
// and, through those, every module the file loaded.
function releaseSuite(suite: Suite, hooks: HookChain): void {
  for (const child of suite.children) {
    if (child.type === "test") {
      child.fn = undefined;
    }
  }
  for (const list of [
    suite.children,
    suite.beforeAll,
    suite.afterAll,
    suite.beforeEach,
    suite.afterEach,
    hooks.beforeEach,
    hooks.afterEach,
  ]) {
    list.length = 0;
  }
}

async function resetForNextFile(): Promise<void> {
  finishSnapshots();
  // A spy that a file never restored would be undone by the next file's own
  // restoreAllMocks, on top of globals that have been reset since. Spies go
  // first, so that a fake clock a spy wrapped is back in place to be removed.
  moduleMocker.restoreAllMocks();
  fakeClock().useRealTimers();
  restoreTimerGlobals();
  clearPendingTimers();
  trackTimers();
  await flushAndRemoveRoutes();

  resetDocument();
  restoreRealm();
  restoreEnvironment();
  replaceWindowForNextFile();

  restoreSharedPackages();
  restoreSetupMocks();
  restoreCanvasMocks();
  rememberCanvasMocks();
  repositoryReset();

  resetMocksForNextFile();
  evictProjectModules();
  resetClipboard();
  runSetupFiles();
  rememberCanvasMocks();
  recordRealmBaseline();
}

function resetDocument(): void {
  currentWindow().document.body.innerHTML = "";
  resetFocus();
  resetClipboard();
}

function replaceWindowForNextFile(): void {
  const previous = replaceWindow();
  mirrorGlobalsAgain();
  tryTo(() => previous.close());
  // Packages that bind to the window load again, and register their hooks
  // again when they do.
  evictModules((file) => WINDOW_BOUND_PACKAGES.test(file));
  forgetPackageHooks((packageFrame) =>
    WINDOW_BOUND_PACKAGES.test(packageFrame),
  );
}
