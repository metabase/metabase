// The `jest` object and `expect`, built from jest's own packages so that
// matchers, mocks, snapshots and fake timers behave as they do under jest.
import fs from "node:fs";
import { createRequire, isBuiltin } from "node:module";
import path from "node:path";

import {
  type MatcherContext,
  type MatcherFunctionWithContext,
  expect,
} from "expect";
import { type Mock, ModuleMocker } from "jest-mock";
import {
  type Context as SnapshotContext,
  SnapshotState,
  toMatchInlineSnapshot,
  toMatchSnapshot,
  toThrowErrorMatchingInlineSnapshot,
  toThrowErrorMatchingSnapshot,
} from "jest-snapshot";

import { root, runnerDirectory } from "../jest-config.ts";

import {
  exportsOfMock,
  forgetMockExports,
  isMocked,
  moduleKey,
  removeMock,
  requireActualFile,
  setMock,
  withoutMocks,
} from "./mocks.ts";
import {
  evictProjectModules,
  putProjectModules,
  takeProjectModules,
} from "./module-cache.ts";
import { resolveForMock } from "./module-hooks.ts";
import { findFile, resolveProjectFile } from "./resolve.ts";
import { recordSnapshots } from "./results.ts";
import { type FakeTimersConfig, fakeClock, useFakeTimers } from "./timers.ts";

type UnknownFunction = (...args: unknown[]) => unknown;

export const moduleMocker = new ModuleMocker(globalThis);

let snapshotState: SnapshotState | null = null;
let mocksCreatedDuringCollection: Mock[] | null = null;

/**
 * Installs `expect` with jest's snapshot matchers, and the `jest` object.
 */
export function installJestObject(): void {
  setCurrentTestName("");
  expect.extend({
    toMatchSnapshot: withSnapshotState(toMatchSnapshot),
    toMatchInlineSnapshot: withSnapshotState(toMatchInlineSnapshot),
    toThrowErrorMatchingSnapshot: withSnapshotState(
      toThrowErrorMatchingSnapshot,
    ),
    toThrowErrorMatchingInlineSnapshot: withSnapshotState(
      toThrowErrorMatchingInlineSnapshot,
    ),
  });
  Object.assign(globalThis, { expect, jest: createJestObject() });
}

export function startSnapshots(specFile: string): void {
  snapshotState = new SnapshotState(
    path.join(
      path.dirname(specFile),
      "__snapshots__",
      `${path.basename(specFile)}.snap`,
    ),
    {
      updateSnapshot: process.env.NT_UPDATE_SNAPSHOTS ? "all" : "new",
      snapshotFormat: { escapeString: false, printBasicPrototype: false },
      rootDir: root,
    },
  );
}

export function finishSnapshots(): void {
  if (!snapshotState) {
    return;
  }
  const { deleted } = snapshotState.save();
  recordSnapshots({
    added: snapshotState.added,
    matched: snapshotState.matched,
    unmatched: snapshotState.unmatched,
    updated: snapshotState.updated,
    unchecked: snapshotState.getUncheckedCount(),
    uncheckedKeys: snapshotState.getUncheckedKeys(),
    fileDeleted: deleted,
  });
  snapshotState = null;
}

/**
 * jest joins the describe path and the test name with single spaces.
 */
export function setCurrentTestName(name: string): void {
  // jest-snapshot extends expect's state with the snapshot state.
  const state = { snapshotState, currentTestName: name };
  expect.setState(state);
}

function withSnapshotState<Expected extends unknown[]>(
  matcher: MatcherFunctionWithContext<SnapshotContext, Expected>,
) {
  return function (
    this: MatcherContext,
    received: unknown,
    ...expected: Expected
  ) {
    // setCurrentTestName puts the snapshot state into every matcher context.
    return matcher.call(this as SnapshotContext, received, ...expected);
  };
}

/**
 * Runs the function and returns the mock functions that jest.fn created
 * meanwhile.
 */
export function collectMocksCreatedDuring(run: () => void): Mock[] {
  const created: Mock[] = [];
  mocksCreatedDuringCollection = created;
  try {
    run();
  } finally {
    mocksCreatedDuringCollection = null;
  }
  return created;
}

function createJestObject() {
  const jest = {
    fn: (implementation?: UnknownFunction) => {
      const mock = moduleMocker.fn(implementation);
      mocksCreatedDuringCollection?.push(mock);
      return mock;
    },
    spyOn: moduleMocker.spyOn.bind(moduleMocker),
    mocked: <T>(value: T) => value,
    isMockFunction: moduleMocker.isMockFunction.bind(moduleMocker),
    clearAllMocks: () => moduleMocker.clearAllMocks(),
    resetAllMocks: () => moduleMocker.resetAllMocks(),
    restoreAllMocks: () => moduleMocker.restoreAllMocks(),
    replaceProperty: moduleMocker.replaceProperty.bind(moduleMocker),
    mock: (id: string, factory?: () => unknown) => {
      mockModule(id, factory);
      return jest;
    },
    doMock: (id: string, factory?: () => unknown) => {
      mockModule(id, factory);
      return jest;
    },
    unmock: (id: string) => {
      removeMock(resolveFrom(id, callerFile()));
      return jest;
    },
    requireActual,
    requireMock: (id: string) => {
      const from = callerFile();
      const key = resolveFrom(id, from);
      return isMocked(key) ? exportsOfMock(key) : createRequire(from)(key);
    },
    // Project modules evaluate again on their next require. Packages stay, as
    // they do between files, so React and Testing Library keep one copy.
    resetModules: () => {
      evictProjectModules();
      forgetMockExports();
      return jest;
    },
    isolateModules: (fn: () => void) => {
      const outer = takeProjectModules();
      try {
        fn();
      } finally {
        putProjectModules(outer);
      }
    },
    isolateModulesAsync: async (fn: () => Promise<void>) => {
      const outer = takeProjectModules();
      try {
        await fn();
      } finally {
        putProjectModules(outer);
      }
    },
    useFakeTimers: (config?: FakeTimersConfig) => {
      useFakeTimers(config);
      return jest;
    },
    useRealTimers: () => {
      fakeClock().useRealTimers();
      return jest;
    },
    advanceTimersByTime: (ms: number) => fakeClock().advanceTimersByTime(ms),
    advanceTimersByTimeAsync: (ms: number) =>
      fakeClock().advanceTimersByTimeAsync(ms),
    runAllTimers: () => fakeClock().runAllTimers(),
    runAllTimersAsync: () => fakeClock().runAllTimersAsync(),
    runOnlyPendingTimers: () => fakeClock().runOnlyPendingTimers(),
    runOnlyPendingTimersAsync: () => fakeClock().runOnlyPendingTimersAsync(),
    advanceTimersToNextTimer: (steps?: number) =>
      fakeClock().advanceTimersToNextTimer(steps),
    clearAllTimers: () => fakeClock().clearAllTimers(),
    getTimerCount: () => fakeClock().getTimerCount(),
    setSystemTime: (now?: number | Date) => fakeClock().setSystemTime(now),
    getRealSystemTime: () => fakeClock().getRealSystemTime(),
    now: () => fakeClock().now(),
    retryTimes: () => jest,
    setTimeout: () => jest,
  };
  return jest;
}

function requireActual(id: string): unknown {
  const key = resolveFrom(id, callerFile());
  if (key.startsWith("node:")) {
    return process.getBuiltinModule(key);
  }
  return requireActualFile(key);
}

function mockModule(id: string, factory?: () => unknown): void {
  const from = callerFile();
  const key = resolveFrom(id, from);
  if (factory) {
    setMock(key, factory);
    return;
  }
  const manualMock = findFile(
    path
      .join(path.dirname(key), "__mocks__", path.basename(key))
      .replace(/\.[jt]sx?$/, ""),
  );
  if (manualMock) {
    setMock(key, () => createRequire(from)(manualMock));
  } else if (key.startsWith("node:")) {
    // The loader remembers what a parent resolved a request to, and for a
    // builtin that is now the stub, so the real module comes from the process.
    setMock(key, () => automock(process.getBuiltinModule(key)));
  } else {
    setMock(key, () => withoutMocks(() => automock(requireActualFile(key))));
  }
}

function automock(actual: unknown): unknown {
  const metadata = moduleMocker.getMetadata(actual);
  return metadata ? moduleMocker.generateFromMetadata(metadata) : actual;
}

function resolveFrom(id: string, from: string): string {
  if (isBuiltin(id)) {
    return moduleKey(id, "");
  }
  return resolveProjectFile(id, from) ?? resolveForMock(id, from);
}

// The file of the code that called into the jest object, for relative module
// ids.
function callerFile(): string {
  for (const frame of (new Error().stack ?? "").split("\n").slice(1)) {
    const match = frame.match(/\(?(?:file:\/\/)?(\/[^:)]+):\d+:\d+\)?$/);
    if (
      match &&
      !match[1].startsWith(runnerDirectory) &&
      fs.existsSync(match[1])
    ) {
      return match[1];
    }
  }
  return path.join(root, "index.js");
}
