// Packages load once for the life of a worker, where jest loads them again
// for every spec file. This watches them load, so that what they set up
// survives the resets between files and what a file changes in them does not.
import { mirrorGlobalsOntoWindow } from "./dom.ts";
import { wrapCompile, wrapLoad } from "./node-loader.ts";
import { isProjectSource } from "./project.ts";
import {
  type Descriptors,
  ownDescriptors,
  restoreDescriptors,
  sameDescriptor,
  tryTo,
} from "./properties.ts";
import { globalBaseline } from "./realm.ts";
import { clockIsReal } from "./timers.ts";

/**
 * Packages that bind to the window that is current when they load, such as
 * Testing Library's `screen`. They load again for each spec file, which gets a
 * new window.
 */
export const WINDOW_BOUND_PACKAGES =
  /\/node_modules\/(@testing-library|jest-canvas-mock|@emotion)\//;

// The UI packages stay loaded, and project code can still write onto a
// package's own objects while it loads, as the popover dropdown registration
// does. The package would then keep pointing at one file's copy of that code.
const SHARED_UI_PACKAGES = /\/node_modules\/(@mantine|@emotion)\//;

const CLOCK_GLOBALS = [
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
  "setImmediate",
  "clearImmediate",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "requestIdleCallback",
  "cancelIdleCallback",
  "Date",
  "performance",
  "queueMicrotask",
];

/**
 * Global keys that a package added while it loaded. They stay between files,
 * because the package will not load again to add them.
 */
export const globalsAddedByPackages = new Set<PropertyKey>();

const sharedPackagesToRecord: NodeJS.Module[] = [];
const sharedPackageBaselines: Array<[object, Descriptors]> = [];
const recordedExports = new WeakSet<object>();
let packageLoadDepth = 0;
let requireDepth = 0;
let packagesLoadedSinceMirror = true;

export function watchPackageLoading(): void {
  wrapCompile(
    (compile) =>
      function (content, filename, ...rest) {
        if (isProjectSource(filename)) {
          return compile.call(this, content, filename, ...rest);
        }
        const result = compilePackage(() =>
          compile.call(this, content, filename, ...rest),
        );
        // A package that loads again for each file needs no baseline, and one
        // would keep every old copy of it alive.
        if (
          SHARED_UI_PACKAGES.test(filename) &&
          !WINDOW_BOUND_PACKAGES.test(filename)
        ) {
          sharedPackagesToRecord.push(this);
        }
        return result;
      },
  );

  wrapLoad(
    (load) =>
      function (request, parent, isMain) {
        requireDepth += 1;
        try {
          return load.call(this, request, parent, isMain);
        } finally {
          // A package's exports are recorded as they are when control first
          // comes back to project code.
          if (
            sharedPackagesToRecord.length > 0 &&
            parent?.filename &&
            isProjectSource(parent.filename)
          ) {
            recordSharedPackageExports();
          }
          requireDepth -= 1;
          if (requireDepth === 0 && packagesLoadedSinceMirror) {
            packagesLoadedSinceMirror = false;
            mirrorGlobalsOntoWindow();
          }
        }
      },
  );
}

/**
 * Makes everything on the global object readable from a new window.
 */
export function mirrorGlobalsAgain(): void {
  packagesLoadedSinceMirror = false;
  mirrorGlobalsOntoWindow();
}

/**
 * Puts back the exports of the shared UI packages as they were when they
 * loaded.
 */
export function restoreSharedPackages(): void {
  for (const [target, baseline] of sharedPackageBaselines) {
    restoreDescriptors(target, baseline, { removeAdded: true });
  }
}

function compilePackage<T>(compile: () => T): T {
  packagesLoadedSinceMirror = true;
  // A package that loads inside another one's load is covered by the outer
  // comparison.
  const isOutermost = packageLoadDepth === 0;
  packageLoadDepth += 1;
  const keysBefore = isOutermost ? new Set(Reflect.ownKeys(globalThis)) : null;
  // A package keeps whatever clock functions it reads while it loads
  // (Mantine's `const raf = window.requestAnimationFrame`), so it must not
  // load under a spec's fake clock.
  const fakeClock = clockIsReal() ? [] : swapInRealClock();
  try {
    return compile();
  } finally {
    for (const [name, descriptor] of fakeClock) {
      Object.defineProperty(globalThis, name, descriptor);
    }
    packageLoadDepth -= 1;
    if (keysBefore) {
      for (const key of Reflect.ownKeys(globalThis)) {
        if (!keysBefore.has(key)) {
          globalsAddedByPackages.add(key);
        }
      }
    }
  }
}

// Puts the real clock globals in place and returns the fake ones they
// replaced.
function swapInRealClock(): Array<[string, PropertyDescriptor]> {
  const fake: Array<[string, PropertyDescriptor]> = [];
  for (const name of CLOCK_GLOBALS) {
    const real = globalBaseline.get(name);
    const current = Object.getOwnPropertyDescriptor(globalThis, name);
    if (!real || !current || sameDescriptor(current, real)) {
      continue;
    }
    fake.push([name, current]);
    Object.defineProperty(globalThis, name, real);
  }
  return fake;
}

function recordSharedPackageExports(): void {
  for (const loaded of sharedPackagesToRecord.splice(0)) {
    for (const value of exportedValues(loaded.exports)) {
      if (recordedExports.has(value)) {
        continue;
      }
      recordedExports.add(value);
      tryTo(() => sharedPackageBaselines.push([value, ownDescriptors(value)]));
    }
  }
}

// The module object and its named exports, where they are objects.
function exportedValues(moduleExports: unknown): object[] {
  const values: unknown[] = [moduleExports];
  if (isObject(moduleExports)) {
    tryTo(() => {
      for (const key of Object.keys(moduleExports)) {
        values.push(Reflect.get(moduleExports, key));
      }
    });
  }
  return values.filter(isObject);
}

function isObject(value: unknown): value is object {
  return (
    value !== null && (typeof value === "object" || typeof value === "function")
  );
}
