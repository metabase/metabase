// jest's describe, it and hooks. node:test evaluates every suite body before
// it runs a test, while jest loads and runs one file at a time, and module
// mocks depend on that. So these only collect a tree of the file's tests, and
// run-file.ts runs the tree as node:test subtests before the next file loads.
import { bind as bindEach } from "jest-each";

export type Mode = "run" | "skip" | "only" | "todo";
export type TestFunction = () => unknown;
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

export const rootSuite = createSuite("root", "run");
const suiteStack: Suite[] = [rootSuite];

// A package can register hooks when it is first imported. React Testing
// Library does, to tell React that this is a test environment. jest loads
// packages again for every file, so those hooks apply to every file. Here a
// package loads once, so its hooks are kept apart from the hooks of the setup
// files, which register theirs again each time they run.
export const packageHooks: Hooks = createHooks();
const packageOfHook = new WeakMap<TestFunction, string>();

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

export function countTests(suite: Suite): number {
  return suite.children.reduce(
    (count, child) =>
      count + (child.type === "suite" ? countTests(child.suite) : 1),
    0,
  );
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

function declareTest(mode: Mode) {
  return (name: string, fn?: TestFunction, timeoutMs?: number): void => {
    currentSuite().children.push({
      type: "test",
      name,
      fn,
      timeoutMs,
      mode: fn ? mode : "todo",
      path: suiteStack.slice(2).map((suite) => suite.name),
    });
  };
}

function createTestFunction(mode: Mode) {
  const declare = declareTest(mode);
  return Object.assign(declare, {
    // jest's own table implementation, so %s, %p, $named templates and tagged
    // template tables behave as the specs expect.
    each: bindEach(declare),
    skip: Object.assign(declareTest("skip"), {
      each: bindEach(declareTest("skip")),
    }),
    only: Object.assign(declareTest("only"), {
      each: bindEach(declareTest("only")),
    }),
    todo: (name: string) => declareTest("todo")(name),
    failing: (name: string, fn: TestFunction, timeoutMs?: number) =>
      declare(name, () => expectFailure(fn), timeoutMs),
  });
}

// jest runs a failing test and passes it only when its body throws.
async function expectFailure(fn: TestFunction): Promise<void> {
  try {
    await fn();
  } catch {
    return;
  }
  throw new Error(
    "Failing test passed even though it was supposed to fail. Remove `.failing` to remove error.",
  );
}

function declareDescribe(mode: Mode) {
  return (name: string, fn: () => void): void => {
    const suite = createSuite(name, mode);
    currentSuite().children.push({ type: "suite", suite });
    suiteStack.push(suite);
    try {
      fn();
    } finally {
      suiteStack.pop();
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
  return (fn: TestFunction): void => {
    const packageFrame = packageFrameOfCaller();
    if (packageFrame) {
      packageOfHook.set(fn, packageFrame);
      packageHooks[kind].push(fn);
    } else {
      currentSuite()[kind].push(fn);
    }
  };
}

// The stack frame of the code that registers a hook, when that code is in a
// package.
function packageFrameOfCaller(): string | null {
  const [caller] = (new Error().stack ?? "").split("\n").slice(3, 6);
  return caller?.includes("/node_modules/") ? caller : null;
}
