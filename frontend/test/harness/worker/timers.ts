// Timers: Node's own for the runner's deadlines, tracked ones for the code
// under test, and jest's fake clock.
import { ModernFakeTimers } from "@jest/fake-timers";

import { root } from "../jest-config.ts";

import { isCalledFromRuntime } from "./dom.ts";
import { globals } from "./properties.ts";

type TimerHandle = ReturnType<typeof setTimeout>;
type ProjectConfig = ConstructorParameters<
  typeof ModernFakeTimers
>[0]["config"];
export type FakeTimersConfig = Parameters<ModernFakeTimers["useFakeTimers"]>[0];

// Node's own timers, taken before any fake clock can replace them, so a
// deadline still fires while a test has the clock faked.
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;
const realQueueMicrotask = globalThis.queueMicrotask;

const TEST_HEAP_LIMIT_MB = Number(process.env.NT_TEST_HEAP_MB ?? 800);
const HEAP_CHECK_INTERVAL_MS = 250;

// jsdom fires animation frames every 16 ms of real time, and Redux Toolkit
// holds some store notifications until the next frame. A spec that acts right
// after a request settles passes under jest only because a cold file takes
// several frames to do anything. Files here run about three times faster, so
// frames do too.
const JSDOM_FRAME_INTERVAL_MS = 1000 / 60;
const FRAME_INTERVAL_MS = Number(process.env.NT_FRAME_MS ?? 1);

// jest drops a file's pending timers with its environment. One shared realm
// keeps them, so a 60 second cache timer of one file would fire during a
// later one, and the event loop would wait for it. Timers created while a
// file runs are tracked and cleared after it.
const pendingTimers = new Set<TimerHandle>();

const trackedSetTimeout = (
  callback: (...args: unknown[]) => void,
  delay?: number,
  ...args: unknown[]
): TimerHandle => {
  const handle = realSetTimeout(callback, delay, ...args);
  pendingTimers.add(handle);
  return handle;
};

const trackedSetInterval = (
  callback: (...args: unknown[]) => void,
  delay?: number,
  ...args: unknown[]
): TimerHandle => {
  const interval =
    delay === JSDOM_FRAME_INTERVAL_MS ? FRAME_INTERVAL_MS : delay;
  const handle = realSetInterval(callback, interval, ...args);
  pendingTimers.add(handle);
  return handle;
};

// Reads and writes reach the global object, while the identity check that
// makes sinon fake the `timers` module as well sees a different object.
// node:test builds its timeouts on that module, and jest's jsdom global is a
// separate object in the same way.
const fakeTimerTarget = new Proxy(globalThis, {});
let clock: ModernFakeTimers | null = null;

/**
 * Creates jest's fake clock. The clock decides at creation which timers it
 * can fake, so it is created once the window has put its timers, such as
 * requestAnimationFrame, on the global object and setImmediate is hidden.
 */
export function createFakeClock(): void {
  clock = new ModernFakeTimers({
    global: fakeTimerTarget,
    // The clock reads only these two fields of jest's project config.
    config: {
      fakeTimers: { enableGlobally: false, timerLimit: 20000 },
      rootDir: root,
    } as ProjectConfig,
  });
}

export function fakeClock(): ModernFakeTimers {
  if (!clock) {
    throw new Error("The fake clock is used before it is created");
  }
  return clock;
}

/**
 * jest.useFakeTimers. jest's clock installs on a sandboxed jsdom global, so
 * Node and jsdom keep the real nextTick and queueMicrotask while the code
 * under test gets fake ones. Here there is one global object. nextTick stays
 * real for everyone, because Node's streams run on it. queueMicrotask is fake
 * for every caller except the runtime, so code that batches its work with it
 * runs when the test advances the clock, as under jest.
 */
export function useFakeTimers(config?: FakeTimersConfig): void {
  fakeClock().useFakeTimers({
    ...config,
    doNotFake: [
      ...new Set([...(config?.doNotFake ?? []), "nextTick" as const]),
    ],
  });
  const fakeQueueMicrotask = globalThis.queueMicrotask;
  if (fakeQueueMicrotask === realQueueMicrotask) {
    return;
  }
  // The clock marks the functions it installs, and reads the marks to put the
  // real ones back. Object.assign copies the marks onto the wrapper.
  globalThis.queueMicrotask = Object.assign(function queueMicrotask(
    callback: VoidFunction,
  ) {
    return isCalledFromRuntime()
      ? realQueueMicrotask(callback)
      : fakeQueueMicrotask(callback);
  }, fakeQueueMicrotask);
}

/**
 * Whether the clock is Node's own, tracked or not, rather than a fake one.
 */
export function clockIsReal(): boolean {
  return (
    globalThis.setInterval === realSetInterval ||
    globalThis.setInterval === trackedSetInterval
  );
}

export function trackTimers(): void {
  for (const [name, tracked] of [
    ["setTimeout", trackedSetTimeout],
    ["setInterval", trackedSetInterval],
  ] as const) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value: tracked,
    });
  }
}

export function clearPendingTimers(): void {
  for (const handle of pendingTimers) {
    realClearTimeout(handle);
    realClearInterval(handle);
  }
  pendingTimers.clear();
}

/**
 * sinon's uninstall deletes a timer global that it believes was not an own
 * property, and once deleted, every later install repeats that. So the
 * originals go back after each file.
 */
export function restoreTimerGlobals(): void {
  const originals = {
    setTimeout: realSetTimeout,
    clearTimeout: realClearTimeout,
    setInterval: realSetInterval,
    clearInterval: realClearInterval,
  };
  for (const [name, original] of Object.entries(originals)) {
    if (typeof globals[name] !== "function") {
      Object.defineProperty(globalThis, name, {
        value: original,
        writable: true,
        configurable: true,
      });
    }
  }
}

export class TestTimeoutError extends Error {}

let poisoned = false;

/**
 * Whether a test outlived its deadline. Its body cannot be cancelled, and in a
 * shared process it keeps registering routes and timers for later tests to
 * trip over, so the worker is spent.
 */
export function isPoisoned(): boolean {
  return poisoned;
}

/**
 * Runs a test body or a hook with a deadline on Node's own clock, and fails it
 * when it adds more heap than one test should. A runaway test can fill the
 * heap long before the deadline, and running out of memory would take the
 * whole worker with it.
 */
export function withDeadline<T>(
  run: () => T | Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let deadline: TimerHandle | undefined;
  let heapCheck: TimerHandle | undefined;
  const stop = () => {
    realClearTimeout(deadline);
    realClearInterval(heapCheck);
  };

  const body = Promise.resolve().then(run).finally(stop);
  const limits = new Promise<never>((_, reject) => {
    deadline = realSetTimeout(() => {
      stop();
      poisoned = true;
      reject(new TestTimeoutError(`test timed out after ${timeoutMs} ms`));
    }, timeoutMs);
    // The worker lives long and its heap only grows, so the limit applies to
    // what this test adds.
    const heapAtStartMb = heapUsedMb();
    heapCheck = realSetInterval(() => {
      const growthMb = heapUsedMb() - heapAtStartMb;
      if (growthMb > TEST_HEAP_LIMIT_MB) {
        stop();
        reject(
          new TestTimeoutError(
            `test aborted after adding ${growthMb} MB of heap`,
          ),
        );
      }
    }, HEAP_CHECK_INTERVAL_MS);
  });
  return Promise.race([body, limits]);
}

function heapUsedMb(): number {
  return Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
}
