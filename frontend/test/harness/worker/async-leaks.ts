// React and Testing Library stay loaded from one spec file to the next, so an
// act() or waitFor that a test did not wait for keeps running in later tests
// and files. This finds the test that started it and fails that test.
import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";
import path from "node:path";

import { root } from "../jest-config.ts";
import type { TestIdentity } from "../types.ts";

import { globals } from "./properties.ts";

type TestScope = {
  name: string;
  identity: TestIdentity;
  hasEnded: boolean;
};
type Scope = {
  file: string;
  test?: TestScope;
  waitFor?: AsyncWork;
};
type AsyncWork = {
  scope: Scope;
  kind: string;
  startedAt: Error;
};
type Thenable = {
  then: (
    onResolved?: (value: unknown) => unknown,
    onRejected?: (error: unknown) => unknown,
  ) => unknown;
};
type ActCallback = () => unknown;
type Act = (callback: ActCallback) => unknown;
type AsyncWrapper = (callback: () => Promise<unknown>) => Promise<unknown>;
type LateLeak = { test: TestScope; error: Error };

const scopes = new AsyncLocalStorage<Scope>();
const runningWork = new Set<AsyncWork>();
const lateLeaks: LateLeak[] = [];
const wrappedAsyncWrappers = new WeakSet<AsyncWrapper>();
let runningFile = "";

export function runInFileScope<T>(file: string, run: () => T): T {
  runningFile = file;
  return scopes.run({ file }, run);
}

export function runInTestScope<T>(test: TestScope, run: () => T): T {
  return scopes.run({ file: runningFile, test }, run);
}

/**
 * An act() or waitFor that started in an earlier file can finish during a
 * later one. It then restores the act environment flag that it saw when it
 * started, and can switch the flag under the later file's own waitFor. Such
 * writes from an earlier file are ignored.
 */
export function guardActEnvironment(): void {
  let isActEnvironment: unknown = globals.IS_REACT_ACT_ENVIRONMENT;
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    enumerable: true,
    get: () => isActEnvironment,
    set: (value: unknown) => {
      const writer = scopes.getStore();
      if (writer === undefined || writer.file === runningFile) {
        isActEnvironment = value;
      }
    },
  });
}

/**
 * Wraps React's act so that each async act is tracked. Testing Library copies
 * act when it loads, so this runs before it first loads.
 */
export function trackAsyncActs(): void {
  const requireFromRoot = createRequire(path.join(root, "package.json"));
  const react: { act: Act } = requireFromRoot("react");
  const act = react.act;
  react.act = (callback: ActCallback) => {
    let isAsync = false;
    const result = act(() => {
      const callbackResult = callback();
      isAsync = isThenable(callbackResult);
      return callbackResult;
    });
    const work = isAsync && isThenable(result) ? startWork("act()") : null;
    return work && isThenable(result) ? settleThrough(result, work) : result;
  };
}

// React warns about an async act that nobody awaits once its result's then
// is never called. So the result is not subscribed to here: the work ends
// when the caller's then sees it end.
function settleThrough(result: Thenable, work: AsyncWork): Thenable {
  return {
    then: (onResolved, onRejected) =>
      result.then(
        (value) => {
          runningWork.delete(work);
          return onResolved ? onResolved(value) : value;
        },
        (error) => {
          runningWork.delete(work);
          if (onRejected) {
            return onRejected(error);
          }
          throw error;
        },
      ),
  };
}

/**
 * Wraps the asyncWrapper of the Testing Library copy that the spec files
 * get, which runs every waitFor, findBy query and user-event call. That copy
 * loads again for each file.
 */
export function trackAsyncWrapper(): void {
  const requireFromRoot = createRequire(path.join(root, "package.json"));
  const requireFromReact = createRequire(
    requireFromRoot.resolve("@testing-library/react"),
  );
  const dom: {
    getConfig: () => { asyncWrapper: AsyncWrapper };
    configure: (config: { asyncWrapper: AsyncWrapper }) => void;
  } = requireFromReact("@testing-library/dom");
  const { asyncWrapper } = dom.getConfig();
  if (wrappedAsyncWrappers.has(asyncWrapper)) {
    return;
  }
  // The acts that a waitFor starts run in a scope that names it, so that a
  // failure can point at the waitFor in the spec.
  const tracked: AsyncWrapper = (callback) => {
    const work = startWork("waitFor, findBy or user-event call");
    if (!work) {
      return asyncWrapper(callback);
    }
    const result = scopes.run({ ...work.scope, waitFor: work }, () =>
      asyncWrapper(callback),
    );
    const end = () => {
      runningWork.delete(work);
    };
    result.then(end, end);
    return result;
  };
  wrappedAsyncWrappers.add(tracked);
  dom.configure({ asyncWrapper: tracked });
}

/**
 * The error for a test that ended while async work it started was still
 * running, or null. The work is forgotten either way.
 */
export function takeRunningWorkOf(test: TestScope): Error | null {
  test.hasEnded = true;
  const leftover = [...runningWork].filter((work) => work.scope.test === test);
  for (const work of leftover) {
    runningWork.delete(work);
  }
  return leftover.length > 0
    ? leakError(leftover[0], "was still running")
    : null;
}

/**
 * Tests of the running file that started async work after they ended.
 */
export function takeLateLeaks(): LateLeak[] {
  return lateLeaks.splice(0);
}

// The work, or null for work that is not tracked: outside a test, or started
// after its test ended.
function startWork(kind: string): AsyncWork | null {
  const scope = scopes.getStore();
  const test = scope?.test;
  if (!scope || !test) {
    return null;
  }
  const work: AsyncWork = { scope, kind, startedAt: new Error() };
  if (test.hasEnded) {
    if (scope.file === runningFile) {
      lateLeaks.push({ test, error: leakError(work, "started") });
    }
    return null;
  }
  runningWork.add(work);
  return work;
}

function leakError(work: AsyncWork, what: string): Error {
  const { waitFor } = work.scope;
  const error = new Error(
    waitFor
      ? `An act() that a waitFor started ${what} after this test ended. Under fake timers, a waitFor with an async callback resolves before its last act() ends. Give it a synchronous callback.`
      : `An async ${work.kind} ${what} after this test ended. Await it, or the async function that calls it, such as setup(). In jest it keeps running into the next tests.`,
  );
  error.stack = [error.message, ...specFramesFirst(waitFor ?? work)].join("\n");
  return error;
}

// The call in the spec file that started the work comes first, so that the
// failure points at it rather than at a helper.
function specFramesFirst(work: AsyncWork): string[] {
  const frames = (work.startedAt.stack ?? "").split("\n").slice(1);
  const specFrame = frames.findLast((frame) => frame.includes(work.scope.file));
  return specFrame
    ? [specFrame, ...frames.filter((frame) => frame !== specFrame)]
    : frames;
}

function isThenable(value: unknown): value is Thenable {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  );
}
