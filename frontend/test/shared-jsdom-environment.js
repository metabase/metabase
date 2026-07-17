/**
 * A jest test environment that reuses one jsdom instance per worker instead
 * of constructing a fresh one for every spec file.
 *
 * Building jsdom is a fixed per-file cost; across ~1,800 spec files it adds
 * minutes of CPU per full run. Jest's module isolation is untouched — every
 * file still gets a fresh module registry — only the DOM world (window,
 * document, storage) is shared.
 *
 * The hard problem with sharing is ASYNC STRAGGLERS: a file can end while
 * its components still have pending timers, fetches, or promise chains, and
 * under stock jest those die against a torn-down window. Here the window
 * stays alive, so the boundary reset builds a fence:
 *
 *  1. Fake timers left installed by a spec are disposed FIRST (sinon's
 *     uninstall deletes globals like Date if the descriptor restore runs
 *     before it).
 *  2. A bounded drain (two macrotask turns) lets already-queued stragglers
 *     fire into the OLD world.
 *  3. All real timers scheduled during the file are cleared (setTimeout /
 *     setInterval are wrapped to track ids).
 *  4. Event listeners added to window/document during the file are removed
 *     (their addEventListener is wrapped to track registrations).
 *  5. document.body is REPLACED with a fresh node — element listeners die
 *     with it, and stragglers holding references to old elements mutate a
 *     detached tree, exactly like stock jest's dead window.
 *  6. Global keys added since the pristine post-setup snapshot are deleted;
 *     baseline globals whose descriptor changed are restored. Ditto for a
 *     curated set of shared prototypes/objects tests are known to patch
 *     (HTMLElement.prototype, navigator, URL, ...). This is also what lets
 *     the compiled cljs bundle (which registers goog/$CLJS namespaces on the
 *     global) re-register cleanly per file.
 *  7. Storage/history/console/process-listener cleanup.
 *
 * Known limits: in-place mutation of arbitrary deep objects isn't restored,
 * and a straggler can still run code between boundaries — the fence bounds
 * the blast radius (detached DOM, cleared timers) rather than pausing the
 * world. jsdom-internal errors route to the first file's console.
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
      shared.__nextContext = context;
      return shared;
    }
    super(config, context);
    this.__nextContext = null;
    shared = this;
  }

  __installTrackers() {
    const g = this.global;

    this.__activeTimers = new Set();
    this.__activeIntervals = new Set();
    const origSetTimeout = g.setTimeout.bind(g);
    const origSetInterval = g.setInterval.bind(g);
    const origClearTimeout = g.clearTimeout.bind(g);
    const origClearInterval = g.clearInterval.bind(g);
    this.__origSetTimeout = origSetTimeout;
    this.__origClearTimeout = origClearTimeout;
    this.__origClearInterval = origClearInterval;

    const env = this;
    g.setTimeout = function (...args) {
      const id = origSetTimeout(...args);
      env.__activeTimers.add(id);
      return id;
    };
    g.setInterval = function (...args) {
      const id = origSetInterval(...args);
      env.__activeIntervals.add(id);
      return id;
    };
    g.clearTimeout = function (id) {
      env.__activeTimers.delete(id);
      return origClearTimeout(id);
    };
    g.clearInterval = function (id) {
      env.__activeIntervals.delete(id);
      return origClearInterval(id);
    };

    this.__trackedListeners = [];
    for (const target of [g, g.document]) {
      const origAdd = target.addEventListener.bind(target);
      target.addEventListener = (type, listener, options) => {
        env.__trackedListeners.push({ target, type, listener, options });
        return origAdd(type, listener, options);
      };
    }
  }

  async setup() {
    if (this.__setupDone) {
      await this.__resetBetweenFiles(this.__nextContext);
      return;
    }
    await super.setup();
    // Trackers must exist BEFORE the baseline snapshot so the wrapped
    // setTimeout/addEventListener are what the descriptor restore preserves.
    this.__installTrackers();
    this.__baseline = new Map(
      Reflect.ownKeys(this.global).map((key) => [
        key,
        Object.getOwnPropertyDescriptor(this.global, key),
      ]),
    );
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

  async __resetBetweenFiles(context) {
    const g = this.global;

    // 1. Fake timers first, while sinon's fakes are still installed.
    try {
      this.fakeTimers?.dispose?.();
      this.fakeTimersModern?.dispose?.();
    } catch (_e) {
      // Timers weren't installed.
    }

    // 2. Bounded drain: let already-queued stragglers fire into the old
    // world before we detach it.
    await new Promise((resolve) => this.__origSetTimeout(resolve, 0));
    await new Promise((resolve) => this.__origSetTimeout(resolve, 0));

    // 3. Clear every real timer scheduled during the file.
    for (const id of this.__activeTimers) {
      this.__origClearTimeout(id);
    }
    for (const id of this.__activeIntervals) {
      this.__origClearInterval(id);
    }
    this.__activeTimers.clear();
    this.__activeIntervals.clear();

    // 4. Remove window/document listeners added during the file.
    for (const { target, type, listener, options } of this
      .__trackedListeners) {
      try {
        target.removeEventListener(type, listener, options);
      } catch (_e) {
        // Listener already gone.
      }
    }
    this.__trackedListeners.length = 0;

    // 5. Fresh body: element listeners die with the old node; stragglers
    // holding old references mutate a detached tree.
    try {
      const freshBody = g.document.createElement("body");
      g.document.documentElement.replaceChild(freshBody, g.document.body);
      g.document.head.innerHTML = "";
    } catch (_e) {
      // Extremely broken DOM; the descriptor restore below still runs.
    }

    // 6. Descriptor restores.
    restoreToBaseline(g, this.__baseline);
    for (const obj of this.__sharedObjects) {
      restoreToBaseline(obj, this.__objectBaselines.get(obj));
    }

    // 7. Storage, history, console, sandboxed-process listeners.
    try {
      g.localStorage?.clear?.();
      g.sessionStorage?.clear?.();
      g.history?.replaceState?.(null, "", "http://localhost/");
      g.process?.removeAllListeners?.("uncaughtException");
    } catch (_e) {
      // Best-effort; anything missed surfaces as a test failure.
    }
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
