/**
 * A jest test environment that reuses one jsdom instance per worker instead
 * of constructing a fresh one for every spec file.
 *
 * Building jsdom is a fixed per-file cost (~50-150ms depending on machine);
 * across ~1,800 spec files it adds minutes of CPU per full run. Jest's module
 * isolation is untouched — every file still gets a fresh module registry —
 * only the DOM world (window, document, storage) is shared.
 *
 * Between files the environment resets itself:
 *
 * 1. Global keys added since the pristine post-setup snapshot are deleted.
 *    This is what lets the compiled cljs bundle (which registers `goog`,
 *    `$CLJS` and namespace roots directly on the global) re-register cleanly
 *    per file instead of colliding with the previous file's copy.
 * 2. Baseline globals whose property descriptor changed (e.g. a test that
 *    replaced `window.matchMedia` without restoring it) are restored to the
 *    pristine descriptor.
 * 3. document body/head, storages and history are cleared.
 * 4. Any fake timers left installed are disposed.
 *
 * Known sharing limits (acceptable, but be aware):
 * - jsdom-internal errors (virtualConsole) route to the first file's console;
 *   test `console.*` output is rebound per file and reports correctly.
 * - In-place mutation of surviving objects (e.g. patching
 *   `HTMLElement.prototype` without mockRestore) leaks to later files, as it
 *   already does within a file's tests today.
 */
const { TestEnvironment: JSDOMEnvironment } = require("jest-environment-jsdom");

let shared = null;

function restoreToBaseline(obj, baseline) {
  for (const key of Reflect.ownKeys(obj)) {
    const pristine = baseline.get(key);
    try {
      if (pristine === undefined) {
        delete obj[key];
      } else {
        const current = Object.getOwnPropertyDescriptor(obj, key);
        const changed =
          current === undefined ||
          current.value !== pristine.value ||
          current.get !== pristine.get ||
          current.set !== pristine.set;
        if (changed) {
          Object.defineProperty(obj, key, pristine);
        }
      }
    } catch (_e) {
      // Non-configurable property — leave it.
    }
  }
  // Restore properties that were deleted outright.
  for (const [key, pristine] of baseline) {
    if (!Object.getOwnPropertyDescriptor(obj, key)) {
      try {
        Object.defineProperty(obj, key, pristine);
      } catch (_e) {
        // Best effort.
      }
    }
  }
}

class SharedJSDOMEnvironment extends JSDOMEnvironment {
  constructor(config, context) {
    if (shared) {
      shared.__debugCheck("before-reset", context);
      shared.__resetBetweenFiles(context);
      shared.__debugCheck("after-reset", context);
      shared.__lastTestPath = context?.testPath;
      return shared;
    }
    super(config, context);
    this.__lastTestPath = context?.testPath;
    shared = this;
  }

  __debugCheck(phase, context) {
    const g = this.global;
    if (typeof g.Date === "undefined") {
      process.stderr.write(
        `[shared-jsdom DEBUG] Date missing ${phase}; prev=${this.__lastTestPath} next=${context?.testPath}\n`,
      );
    }
    if (phase === "after-reset") {
      try {
        const el = g.document.createElement("input");
        g.document.body.appendChild(el);
        el.focus();
        const focusWorks = g.document.activeElement === el;
        el.remove();
        if (!focusWorks) {
          process.stderr.write(
            `[shared-jsdom DEBUG] focus broken (hasFocus=${g.document.hasFocus()}) prev=${this.__lastTestPath} next=${context?.testPath}\n`,
          );
        }
      } catch (e) {
        process.stderr.write(
          `[shared-jsdom DEBUG] focus probe threw: ${e?.message} prev=${this.__lastTestPath}\n`,
        );
      }
    }
  }

  async setup() {
    if (this.__setupDone) {
      return;
    }
    await super.setup();
    this.__baseline = new Map(
      Reflect.ownKeys(this.global).map((key) => [
        key,
        Object.getOwnPropertyDescriptor(this.global, key),
      ]),
    );
    // Tests also patch shared interface prototypes and instances in place
    // (scrollIntoView, getBoundingClientRect, navigator.clipboard, ...);
    // jest.spyOn is restored by jest itself at file teardown, but raw
    // assignments survive, so snapshot the objects tests are known to patch.
    const g = this.global;
    this.__sharedObjects = [
      g.EventTarget?.prototype,
      g.Node?.prototype,
      g.Element?.prototype,
      g.HTMLElement?.prototype,
      g.HTMLInputElement?.prototype,
      g.HTMLCanvasElement?.prototype,
      g.SVGElement?.prototype,
      g.Range?.prototype,
      g.Document?.prototype,
      g.Navigator?.prototype,
      g.navigator,
      g.URL,
      g.Storage?.prototype,
    ].filter(Boolean);
    this.__objectBaselines = new Map(
      this.__sharedObjects.map((obj) => [
        obj,
        new Map(
          Reflect.ownKeys(obj).map((key) => [
            key,
            Object.getOwnPropertyDescriptor(obj, key),
          ]),
        ),
      ]),
    );
    this.__setupDone = true;
  }

  async teardown() {
    // Intentionally keep the jsdom world alive for the next file. The worker
    // process exit is the real teardown.
  }

  __resetBetweenFiles(context) {
    const g = this.global;

    // Dispose fake timers FIRST, while sinon's fakes are still installed.
    // If the descriptor restore below runs first, sinon's uninstall finds a
    // Date/setTimeout that isn't its own fake and deletes the global instead
    // of restoring it.
    try {
      this.fakeTimers?.dispose?.();
      this.fakeTimersModern?.dispose?.();
    } catch (_e) {
      // Timers weren't installed.
    }

    restoreToBaseline(g, this.__baseline);
    for (const obj of this.__sharedObjects) {
      restoreToBaseline(obj, this.__objectBaselines.get(obj));
    }

    try {
      g.document.body.innerHTML = "";
      g.document.head.innerHTML = "";
      g.localStorage?.clear?.();
      g.sessionStorage?.clear?.();
      g.history?.replaceState?.(null, "", "http://localhost/");
    } catch (_e) {
      // Best-effort; anything missed surfaces as a test failure.
    }

    // Route this file's console output to its own reporter instead of the
    // first file's (jsdom wired its virtualConsole to the first context).
    if (context?.console) {
      try {
        Object.defineProperty(g, "console", {
          configurable: true,
          writable: true,
          value: context.console,
        });
      } catch (_e) {
        // Keep the previous console.
      }
    }
  }
}

module.exports = SharedJSDOMEnvironment;
