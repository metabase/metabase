// jest's describe, it and hooks. node:test evaluates every suite body before
// it runs a test, while jest loads and runs one file at a time, and module
// mocks depend on that. So these only collect a tree of the file's tests, and
// run-file.ts runs the tree as node:test subtests before the next file loads.
import { createRequire } from "node:module";

import { bind as bindEach } from "jest-each";

export type Mode = "run" | "skip" | "only" | "todo";
export type DoneCallback = (reason?: unknown) => void;
export type TestFunction = (done: DoneCallback) => unknown;
export type HookKind = "beforeAll" | "afterAll" | "beforeEach" | "afterEach";
export type Hooks = Record<HookKind, TestFunction[]>;

export type TestNode = {
  type: "test";
  name: string;
  fn: TestFunction | undefined;
  timeoutMs: number | undefined;
  mode: Mode;
  /**
   * The names of the describe blocks around the test.
   */
  path: string[];
};

export type Suite = Hooks & {
  name: string;
  mode: Mode;
  children: Array<TestNode | { type: "suite"; suite: Suite }>;
};

const TEST_NAME_PATTERN = process.env.NT_TEST_NAME_PATTERN
  ? new RegExp(process.env.NT_TEST_NAME_PATTERN, "i")
  : null;

// jest's messages format values with the pretty-format of jest 30, which is
// the one that jest-each depends on.
const {
  format: prettyFormat,
}: { format: (value: unknown, options?: { maxDepth: number }) => string } =
  createRequire(createRequire(import.meta.url).resolve("jest-each"))(
    "pretty-format",
  );

export const rootSuite = createSuite("root", "run");
let runningTestName: string | null = null;

/**
 * The test that is running, or null. jest refuses to declare a test, a hook
 * or a block while a test runs.
 */
export function setRunningTest(name: string | null): void {
  runningTestName = name;
}

/**
 * A value as jest's messages show it.
 */
export function formatValue(value: unknown): string {
  return prettyFormat(value, { maxDepth: 3 });
}
const suiteStack: Suite[] = [rootSuite];

// A package can register hooks when it is first imported. React Testing
// Library does, to tell React that this is a test environment. jest loads
// packages again for every file, so those hooks apply to every file. Here a
// package loads once, so its hooks are kept apart from the hooks of the setup
// files, which register theirs again each time they run.
export const packageHooks: Hooks = createHooks();
const packageOfHook = new WeakMap<TestFunction, string>();
const timeoutOfHook = new WeakMap<TestFunction, number>();

/**
 * The timeout that the spec gave a hook, as jest's second argument.
 */
export function hookTimeoutOf(fn: TestFunction): number | undefined {
  return timeoutOfHook.get(fn);
}

export function createSuite(name: string, mode: Mode): Suite {
  return { name, mode, children: [], ...createHooks() };
}

/**
 * Collects the tests and blocks that a spec file declares while it loads.
 */
export function collect(fileSuite: Suite, load: () => void): void {
  suiteStack.push(fileSuite);
  try {
    load();
  } finally {
    suiteStack.pop();
  }
}

/**
 * Drops the hooks of packages that load again for each file, because they
 * register their hooks again when they do.
 */
export function forgetPackageHooks(
  isReloaded: (packageFrame: string) => boolean,
): void {
  for (const kind of hookKinds()) {
    packageHooks[kind] = packageHooks[kind].filter(
      (fn) => !isReloaded(packageOfHook.get(fn) ?? ""),
    );
  }
}

/**
 * Decides which tests of a file run, as jest does. A test takes the mode of
 * its describe block unless it has one of its own. If any test in the file is
 * "only", the others are skipped. A name pattern skips the tests whose full
 * name does not match. A describe block left with no test to run is skipped as
 * a whole, so its hooks do not run either.
 */
export function selectTests(fileSuite: Suite): void {
  const tests: TestNode[] = [];
  const inheritModes = (suite: Suite, inherited: Mode) => {
    // Nothing inside a skipped block runs, whatever its own mode is.
    const mode =
      inherited === "skip" || suite.mode === "run" ? inherited : suite.mode;
    for (const child of suite.children) {
      if (child.type === "suite") {
        inheritModes(child.suite, mode);
        continue;
      }
      if (child.mode !== "todo" && (child.mode === "run" || mode === "skip")) {
        child.mode = mode;
      }
      tests.push(child);
    }
  };
  inheritModes(fileSuite, "run");

  const focused = tests.some((test) => test.mode === "only");
  for (const test of tests) {
    if (test.mode === "todo" || test.mode === "skip") {
      continue;
    }
    const named =
      !TEST_NAME_PATTERN || TEST_NAME_PATTERN.test(fullName(test, " "));
    test.mode = named && (!focused || test.mode === "only") ? "run" : "skip";
  }

  const settleBlockModes = (suite: Suite): boolean => {
    let runs = false;
    for (const child of suite.children) {
      const childRuns =
        child.type === "suite"
          ? settleBlockModes(child.suite)
          : child.mode === "run";
      runs = childRuns || runs;
    }
    suite.mode = runs ? "run" : "skip";
    return runs;
  };
  settleBlockModes(fileSuite);
}

export function fullName(test: TestNode, separator: string): string {
  return [...test.path, test.name].join(separator);
}

/**
 * Installs describe, it and the hooks as globals.
 */
export function installTestGlobals(): void {
  const it = createTestFunction("run");
  const describe = createDescribeFunction("run");
  Object.assign(globalThis, {
    describe,
    it,
    test: it,
    xit: it.skip,
    xtest: it.skip,
    xdescribe: describe.skip,
    // These define jest's focused tests for the specs to use.
    // eslint-disable-next-line no-only-tests/no-only-tests
    fit: it.only,
    // eslint-disable-next-line no-only-tests/no-only-tests
    fdescribe: describe.only,
    beforeAll: registerHook("beforeAll"),
    afterAll: registerHook("afterAll"),
    beforeEach: registerHook("beforeEach"),
    afterEach: registerHook("afterEach"),
  });
}

function createHooks(): Hooks {
  return { beforeAll: [], afterAll: [], beforeEach: [], afterEach: [] };
}

function hookKinds(): HookKind[] {
  return ["beforeAll", "afterAll", "beforeEach", "afterEach"];
}

function currentSuite(): Suite {
  return suiteStack[suiteStack.length - 1];
}

// jest names a block or a test after a named function or a number too.
function descriptorName(descriptor: unknown): string {
  if (typeof descriptor === "function" && descriptor.name) {
    return descriptor.name;
  }
  if (
    typeof descriptor === "string" ||
    typeof descriptor === "number" ||
    descriptor === undefined
  ) {
    return `${descriptor}`;
  }
  throw new Error(
    `Invalid first argument, ${String(descriptor)}. It must be a named class, named function, number, or string.`,
  );
}

function declareTest(mode: Mode) {
  return (descriptor: unknown, fn?: TestFunction, timeoutMs?: number): void => {
    const name = descriptorName(descriptor);
    if (runningTestName !== null) {
      throw new Error(
        `Tests cannot be nested. Test "${name}" cannot run because it is nested within "${runningTestName}".`,
      );
    }
    if (typeof fn !== "function") {
      throw new Error(
        "Missing second argument. It must be a callback function. Perhaps you want to use `test.todo` for a test placeholder.",
      );
    }
    currentSuite().children.push({
      type: "test",
      name,
      fn,
      timeoutMs,
      mode,
      path: suiteStack.slice(2).map((suite) => suite.name),
    });
  };
}

function declareTodo(descriptor: unknown, ...rest: unknown[]): void {
  const name = descriptorName(descriptor);
  if (rest.length > 0) {
    throw new Error("Todo must be called with only a description.");
  }
  currentSuite().children.push({
    type: "test",
    name,
    fn: undefined,
    timeoutMs: undefined,
    mode: "todo",
    path: suiteStack.slice(2).map((suite) => suite.name),
  });
}

function createTestFunction(mode: Mode) {
  const declare = declareTest(mode);
  return Object.assign(declare, {
    // jest's own table implementation, so %s, %p, $named templates and tagged
    // template tables behave as the specs expect.
    each: bindEach(declare),
    skip: Object.assign(declareTest("skip"), {
      each: bindEach(declareTest("skip")),
      failing: declareFailing("skip"),
    }),
    only: Object.assign(declareTest("only"), {
      each: bindEach(declareTest("only")),
      failing: declareFailing("only"),
    }),
    todo: declareTodo,
    failing: declareFailing(mode),
  });
}

// test.failing passes when its body throws.
function declareFailing(mode: Mode) {
  const declare = declareTest(mode);
  const declareOne = (
    descriptor: unknown,
    fn: TestFunction,
    timeoutMs?: number,
  ): void => declare(descriptor, () => expectFailure(fn), timeoutMs);
  return Object.assign(declareOne, { each: bindEach(declareOne) });
}

/**
 * Calls a test or hook as jest does. One that declares a parameter gets a
 * done callback, and ends when it calls it, once. It must not also return a
 * value. A test without one returns a promise or nothing.
 */
export function invokeTestFunction(
  fn: TestFunction,
  kind: "test" | "hook",
): unknown {
  if (fn.length === 0) {
    const returned = fn(() => {});
    if (kind === "test" && returned !== undefined && !isThenable(returned)) {
      throw new Error(
        `test functions can only return Promise or undefined.\nReturned value: ${formatValue(returned)}`,
      );
    }
    return returned;
  }
  return new Promise<void>((resolve, reject) => {
    let wasDone = false;
    // jest checks the returned value one microtask after done, so that a
    // done called during the function itself also sees it.
    const done: DoneCallback = (reason) => {
      if (wasDone) {
        const error = new Error(
          "Expected done to be called once, but it was called multiple times.",
        );
        reject(error);
        throw error;
      }
      wasDone = true;
      void Promise.resolve().then(() => {
        if (returned !== undefined) {
          reject(
            new Error(
              "Test functions cannot both take a 'done' callback and return something. Either use a 'done' callback, or return a promise.",
            ),
          );
        } else if (reason) {
          reject(
            reason instanceof Error
              ? reason
              : new Error(`Failed: ${formatValue(reason)}`),
          );
        } else {
          resolve();
        }
      });
    };
    const returned = fn(done);
  });
}

function isThenable(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  );
}

// jest runs a failing test and passes it only when its body throws.
async function expectFailure(fn: TestFunction): Promise<void> {
  try {
    await invokeTestFunction(fn, "test");
  } catch {
    return;
  }
  throw new Error(
    "Failing test passed even though it was supposed to fail. Remove `.failing` to remove error.",
  );
}

function declareDescribe(mode: Mode) {
  return (descriptor: unknown, fn?: () => unknown): void => {
    const name = descriptorName(descriptor);
    if (runningTestName !== null) {
      throw new Error(
        `Cannot nest a describe inside a test. Describe block "${name}" cannot run because it is nested within "${runningTestName}".`,
      );
    }
    if (fn === undefined) {
      throw new Error(
        "Missing second argument. It must be a callback function.",
      );
    }
    if (typeof fn !== "function") {
      throw new Error(
        `Invalid second argument, ${String(fn)}. It must be a callback function.`,
      );
    }
    const suite = createSuite(name, mode);
    currentSuite().children.push({ type: "suite", suite });
    suiteStack.push(suite);
    let returned: unknown;
    try {
      returned = fn();
    } finally {
      suiteStack.pop();
    }
    if (isThenable(returned)) {
      throw new Error(
        'Returning a Promise from "describe" is not supported. Tests must be defined synchronously.',
      );
    }
    if (returned !== undefined) {
      throw new Error('A "describe" callback must not return a value.');
    }
  };
}

function createDescribeFunction(mode: Mode) {
  const declare = declareDescribe(mode);
  return Object.assign(declare, {
    each: bindEach(declare, false),
    skip: Object.assign(declareDescribe("skip"), {
      each: bindEach(declareDescribe("skip"), false),
    }),
    only: Object.assign(declareDescribe("only"), {
      each: bindEach(declareDescribe("only"), false),
    }),
  });
}

function registerHook(kind: HookKind) {
  return (fn: TestFunction, timeoutMs?: number): void => {
    if (timeoutMs !== undefined) {
      timeoutOfHook.set(fn, timeoutMs);
    }
    const packageFrame = packageFrameOfCaller();
    if (packageFrame) {
      packageOfHook.set(fn, packageFrame);
      packageHooks[kind].push(fn);
      return;
    }
    if (runningTestName !== null) {
      throw new Error(
        `Hooks cannot be defined inside tests. Hook of type "${kind}" is nested within "${runningTestName}".`,
      );
    }
    currentSuite()[kind].push(fn);
  };
}

// The stack frame of the code that registers a hook, when that code is in a
// package.
function packageFrameOfCaller(): string | null {
  const [caller] = (new Error().stack ?? "").split("\n").slice(3, 6);
  return caller?.includes("/node_modules/") ? caller : null;
}
