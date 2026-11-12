// The project's setup files, which jest runs for every spec file: setupFiles,
// then setupFilesAfterEnv. They run here for every spec file too.
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import type { Mock } from "jest-mock";

import { type HookKind, rootSuite } from "./collect.ts";
import { collectMocksCreatedDuring } from "./jest-object.ts";
import { project } from "./project.ts";
import {
  type Descriptors,
  ownDescriptors,
  restoreDescriptors,
} from "./properties.ts";

type ProcessListener = (...args: unknown[]) => void;
type ProcessEvent = string | symbol;

const BETWEEN_FILES_MODULE = "harness-between-files";
const HOOK_KINDS: HookKind[] = [
  "beforeAll",
  "afterAll",
  "beforeEach",
  "afterEach",
];

const require = createRequire(import.meta.url);

// A spec's resetAllMocks also strips the implementations of the mocks that the
// setup files install, such as the clipboard. jest builds those again for each
// file. Here they are remembered, and their implementations go back.
let setupMocks: Array<[Mock, (...args: unknown[]) => unknown]> = [];
let setupProcessListeners: Array<[ProcessEvent, ProcessListener]> = [];
let pristineConsole: Descriptors | null = null;

export function runSetupFiles(): void {
  // Each run registers the root hooks again. Without this every spec file
  // would add another copy for all later tests to run.
  for (const kind of HOOK_KINDS) {
    rootSuite[kind].length = 0;
  }
  // A setup file wraps console.error around whatever is there, so each run
  // would add a layer, which would also keep the previous run alive.
  if (pristineConsole) {
    restoreDescriptors(console, pristineConsole, { removeAdded: true });
  } else {
    pristineConsole = ownDescriptors(console);
  }
  // jest hands each file a copy of the process, with the listeners its setup
  // files add. Here the previous run's listeners go first.
  for (const [event, listener] of setupProcessListeners) {
    process.removeListener(event, listener);
  }
  const listenersBefore = currentProcessListeners();

  // The previous run's mocks also hold the window of the file they were made
  // for, and with it everything that file rendered.
  const created = collectMocksCreatedDuring(() => {
    for (const setupFile of project.setupFiles) {
      require(setupFile);
    }
  });
  setupMocks = created.flatMap((mock) => {
    const implementation = mock.getMockImplementation();
    return implementation ? [[mock, implementation] as const] : [];
  });
  setupProcessListeners = listenersAddedSince(listenersBefore);
}

export function restoreSetupMocks(): void {
  for (const [mock, implementation] of setupMocks) {
    if (!mock.getMockImplementation()) {
      mock.mockImplementation(implementation);
    }
  }
}

/**
 * The repository's own reset between files: the state its code keeps in
 * packages, which stay loaded for the life of the worker. The module sits next
 * to the setup files, and its prepareBetweenFiles returns the function to
 * call.
 */
export function loadRepositoryReset(): () => void {
  const directories = new Set(
    project.setupFiles.map((file) => path.dirname(file)),
  );
  for (const directory of directories) {
    for (const extension of [".ts", ".js"]) {
      const file = path.join(directory, `${BETWEEN_FILES_MODULE}${extension}`);
      if (fs.existsSync(file)) {
        const {
          prepareBetweenFiles,
        }: { prepareBetweenFiles: () => () => void } = require(file);
        return prepareBetweenFiles();
      }
    }
  }
  return () => {};
}

function currentProcessListeners(): Map<ProcessEvent, Set<ProcessListener>> {
  return new Map(
    process.eventNames().map((event) => [event, new Set(listenersOf(event))]),
  );
}

function listenersAddedSince(
  before: Map<ProcessEvent, Set<ProcessListener>>,
): Array<[ProcessEvent, ProcessListener]> {
  const added: Array<[ProcessEvent, ProcessListener]> = [];
  for (const event of process.eventNames()) {
    for (const listener of listenersOf(event)) {
      if (!before.get(event)?.has(listener)) {
        added.push([event, listener]);
      }
    }
  }
  return added;
}

function listenersOf(event: ProcessEvent): ProcessListener[] {
  return process.rawListeners(event).map(
    (listener) =>
      // Node types the listeners as Function. Every one was added with on()
      // or once(), which only take listener functions.
      listener as ProcessListener,
  );
}
