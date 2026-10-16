// The registry behind jest.mock, and the way a mocked module reaches the code
// that requires it.
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire, isBuiltin } from "node:module";
import path from "node:path";

import { cacheDirectory } from "./transform.ts";

type MockFactory = () => unknown;

const MOCK_EXPORTS_GLOBAL = "__nodeTestRunnerMockExports";

const require = createRequire(import.meta.url);

/**
 * A directory of this worker's own, for the stub files below. The pool
 * removes it when the worker is gone, because a spec can emit "exit" on a live
 * process.
 */
export const processDirectory = path.join(
  cacheDirectory,
  `process-${process.pid}`,
);

const factories = new Map<string, MockFactory>();
const mockExports = new Map<string, unknown>();
const stubFiles = new Map<string, string>();
// The real module of a mocked file, held for requireActual and for automocks.
const actualModules = new Map<string, unknown>();
let factoriesFromSetup: Map<string, MockFactory> | null = null;
let bypassDepth = 0;

/**
 * Node remembers what each directory resolved a request to, and skips the
 * resolve hook while that module is cached. A spec directory that has been
 * handed the stub for a path would get the stub again, so the real module is
 * asked for from a directory that only ever sees real modules.
 */
const requireFromActualDirectory = createRequire(
  path.join(processDirectory, "actual", "index.js"),
);

export function prepareMocks(): void {
  fs.mkdirSync(processDirectory, { recursive: true });
  Object.defineProperty(globalThis, MOCK_EXPORTS_GLOBAL, {
    value: exportsOfMock,
  });
}

/**
 * A key for a module: its file, or for a builtin the url that the resolve hook
 * sees, because a builtin has no file.
 */
export function moduleKey(id: string, file: string): string {
  return isBuiltin(id) ? `node:${id.replace(/^node:/, "")}` : file;
}

export function isMocked(key: string): boolean {
  return factories.has(key);
}

/**
 * Whether the setup files mock this module. They mock it again for every file,
 * so each file gets the same mock.
 */
export function isMockedBySetup(key: string): boolean {
  return factoriesFromSetup?.has(key) ?? false;
}

export function isBypassingMocks(): boolean {
  return bypassDepth > 0;
}

export function withoutMocks<T>(load: () => T): T {
  bypassDepth += 1;
  try {
    return load();
  } finally {
    bypassDepth -= 1;
  }
}

export function setMock(key: string, factory: MockFactory): void {
  factories.set(key, factory);
  mockExports.delete(key);
  actualModules.delete(key);
  if (!key.startsWith("node:")) {
    delete require.cache[key];
  }
  // Consumers require the mock through its stub, and Node caches that module,
  // so a later factory for the same key would otherwise never be read.
  const stubFile = stubFiles.get(key);
  if (stubFile) {
    delete require.cache[stubFile];
  }
}

export function removeMock(key: string): void {
  factories.delete(key);
}

export function exportsOfMock(key: string): unknown {
  if (!mockExports.has(key)) {
    const factory = factories.get(key);
    mockExports.set(key, factory?.());
  }
  return mockExports.get(key);
}

/**
 * A mock lives in a stub file of its own. Node caches a module under its file
 * path, so a mock served under the real path would shadow the real module for
 * jest.requireActual.
 */
export function stubFileOf(key: string): string {
  let stubFile = stubFiles.get(key);
  if (!stubFile) {
    const hash = crypto.createHash("sha1").update(key).digest("hex");
    stubFile = path.join(processDirectory, `mock-${hash}.cjs`);
    fs.writeFileSync(
      stubFile,
      `module.exports = globalThis.${MOCK_EXPORTS_GLOBAL}(${JSON.stringify(key)});\n`,
    );
    stubFiles.set(key, stubFile);
  }
  return stubFile;
}

/**
 * The real module of a file that may be mocked. Node would hand the cached
 * real module to any directory that resolved the request to it before, without
 * asking the resolve hook, which would hand out the mock. So the real module
 * of a mocked file never stays in Node's cache.
 */
export function requireActualFile(file: string): unknown {
  if (actualModules.has(file)) {
    return actualModules.get(file);
  }
  const actual = withoutMocks(() => requireFromActualDirectory(file));
  if (factories.has(file)) {
    actualModules.set(file, actual);
    delete require.cache[file];
  }
  return actual;
}

/**
 * Drops the module objects that mocks handed out, so the next require builds
 * them again. jest.resetModules does this.
 */
export function forgetMockExports(): void {
  mockExports.clear();
  actualModules.clear();
}

/**
 * Puts the mocks back to the ones that the setup files registered, for the
 * next spec file.
 */
export function resetMocksForNextFile(): void {
  factories.clear();
  for (const [key, factory] of factoriesFromSetup ?? []) {
    factories.set(key, factory);
  }
  forgetMockExports();
  // The stubs live outside the project, so eviction spares them, and their
  // cached exports would hand the next file objects from the old graph.
  for (const stubFile of stubFiles.values()) {
    delete require.cache[stubFile];
  }
}

/**
 * Remembers the mocks that exist before the first spec file runs. Those come
 * from the setup files, which run again for every file.
 */
export function recordSetupMocks(): void {
  factoriesFromSetup ??= new Map(factories);
}
