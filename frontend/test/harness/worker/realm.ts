// jest hands every spec file a new global object. Here the global object is
// shared, so its properties as they are once the setup files have run are the
// baseline, and whatever a file changed or added is undone between files.
import { currentWindow } from "./dom.ts";
import { globalsAddedByPackages } from "./package-loading.ts";
import {
  type Descriptors,
  ownDescriptors,
  restoreDescriptors,
} from "./properties.ts";

/**
 * The global object's properties as of the last baseline. Kept in place, so
 * that readers keep a live reference.
 */
export const globalBaseline: Descriptors = new Map();

const realmBaseline = new Map<object, Descriptors>();
let environmentBaseline: NodeJS.ProcessEnv = {};

/**
 * Records the current state of the global object and the DOM prototypes as
 * the state to restore.
 */
export function recordRealmBaseline(): void {
  realmBaseline.clear();
  for (const target of realmObjects()) {
    realmBaseline.set(target, ownDescriptors(target));
  }
  globalBaseline.clear();
  for (const [key, descriptor] of ownDescriptors(globalThis)) {
    globalBaseline.set(key, descriptor);
  }
}

export function restoreRealm(): void {
  for (const [target, descriptors] of realmBaseline) {
    restoreDescriptors(target, descriptors, { removeAdded: true });
  }
  restoreDescriptors(globalThis, globalBaseline, {
    removeAdded: true,
    keepAdded: globalsAddedByPackages,
  });
}

/**
 * jest gives each spec file its own copy of process.env. The copy here is the
 * environment once the setup files have run.
 */
export function recordEnvironmentBaseline(): void {
  environmentBaseline = { ...process.env };
}

export function restoreEnvironment(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in environmentBaseline)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(environmentBaseline)) {
    if (process.env[key] !== value) {
      process.env[key] = value;
    }
  }
}

function realmObjects(): object[] {
  const window = currentWindow();
  return [
    window.document,
    window.Document.prototype,
    window.Node.prototype,
    window.EventTarget.prototype,
    window.Element.prototype,
    window.HTMLElement.prototype,
    window.HTMLCanvasElement.prototype,
    window.HTMLIFrameElement.prototype,
    window.ShadowRoot.prototype,
    window.Range.prototype,
    window.Selection.prototype,
    window.navigator,
    // jest gives each file its own console. A spec that assigns a mock to
    // console.warn would otherwise hand its recorded calls to the next file's
    // spyOn, which returns a mock it finds already in place.
    console,
  ];
}
