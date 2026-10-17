// A jsdom window as the global DOM, as jest's jsdom environment provides it,
// on top of Node's own global object.
import { createRequire } from "node:module";
import path from "node:path";

import type * as Jsdom from "jsdom";

import { runnerDirectory } from "../jest-config.ts";

import { globals, propertiesOf, tryTo } from "./properties.ts";

const require = createRequire(import.meta.url);
// The jsdom version that jest's environment uses, not the one at the top of
// node_modules.
const { JSDOM }: typeof Jsdom = createRequire(
  require.resolve("jest-environment-jsdom"),
)("jsdom");

// Globals that stay Node's own. Everything else that the window has is copied
// onto the global object.
const nodeGlobals = new Set([
  "undefined",
  "globalThis",
  "window",
  "self",
  "global",
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
  "setImmediate",
  "clearImmediate",
  "queueMicrotask",
  "console",
  "process",
  "performance",
  "structuredClone",
  "crypto",
  "TextEncoder",
  "TextDecoder",
  "fetch",
  "Request",
  "Response",
  "Headers",
  "ReadableStream",
  "WritableStream",
  "TransformStream",
  "constructor",
]);

// Globals that Node and the window both have, where the window's wins.
// The URL classes and WebSocket are jsdom's under jest. So are atob and btoa,
// but jsdom's call the global ones, which have to stay Node's.
const windowGlobals = new Set([
  "Event",
  "EventTarget",
  "CustomEvent",
  "MessageEvent",
  "ErrorEvent",
  "KeyboardEvent",
  "MouseEvent",
  "FocusEvent",
  "InputEvent",
  "UIEvent",
  "PointerEvent",
  "DragEvent",
  "DOMException",
  "navigator",
  "location",
  "history",
  "localStorage",
  "sessionStorage",
  "addEventListener",
  "removeEventListener",
  "dispatchEvent",
  "postMessage",
  "MutationObserver",
  "URL",
  "URLSearchParams",
  "WebSocket",
]);

// jest's jsdom environment has no Node fetch. A setup file installs the
// cross-fetch polyfill, which is node-fetch there, and specs use jsdom's own
// AbortSignal, Blob, File and FormData. Node's are of a different realm, and
// jsdom's addEventListener and FileReader reject them.
const NODE_FETCH_GLOBALS = [
  "fetch",
  "Request",
  "Response",
  "Headers",
  "FormData",
  "AbortController",
  "AbortSignal",
  "Blob",
  "File",
];

// jest's sandbox global is the window, and it has none of these Node globals.
// Libraries choose their behaviour from them. React's scheduler, for one, uses
// setImmediate when it exists, then MessageChannel, and only then setTimeout,
// which is what it gets under jest.
const NODE_ONLY_GLOBALS = [
  "MessageChannel",
  "MessagePort",
  "BroadcastChannel",
  "ByteLengthQueuingStrategy",
  "CompressionStream",
  "CountQueuingStrategy",
  "CryptoKey",
  "DecompressionStream",
  "PerformanceEntry",
  "PerformanceMark",
  "PerformanceMeasure",
  "PerformanceObserver",
  "PerformanceObserverEntryList",
  "PerformanceResourceTiming",
  "ReadableByteStreamController",
  "ReadableStreamBYOBReader",
  "ReadableStreamBYOBRequest",
  "ReadableStreamDefaultController",
  "ReadableStreamDefaultReader",
  "SubtleCrypto",
  "TextEncoderStream",
  "TransformStreamDefaultController",
  "WritableStreamDefaultController",
  "WritableStreamDefaultWriter",
];

const WINDOW_ALIASES = ["window", "self", "top", "parent"];
const TIMER_GLOBALS = [
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
  "queueMicrotask",
];

let dom = createDom();
let windowKeys = new Set<string>();
const installedWindowKeys = new Set<string>();
const forwarders = new Map<string, (...args: unknown[]) => unknown>();

export function currentWindow(): Jsdom.DOMWindow {
  return dom.window;
}

/**
 * Makes the global object look like jest's: the window's properties on it, and
 * Node's globals that the window lacks removed.
 */
export function installDom(): void {
  replaceNodeFetch();
  if (globals.self === undefined) {
    globals.self = globalThis;
  }
  for (const name of NODE_ONLY_GLOBALS) {
    tryTo(() => Reflect.deleteProperty(globalThis, name));
  }
  hideImmediateFromCodeUnderTest();
  windowKeys = keysOfWindow(dom.window);
  installWindowGlobals({ again: false });
}

/**
 * Gives the next spec file a new window, as jest does. Returns the previous
 * window, to close once nothing refers to it.
 */
export function replaceWindow(): Jsdom.DOMWindow {
  const previous = dom.window;
  dom = createDom();
  installWindowGlobals({ again: true });
  return previous;
}

/**
 * Under jest the global object is the window, so a package that defines a
 * global, such as the CSS.escape polyfill, also defines it on the window.
 * Here they are two objects, so whatever is on the global object is made
 * readable from the window as well.
 */
export function mirrorGlobalsOntoWindow(): void {
  const window = propertiesOf(dom.window);
  for (const key of Object.getOwnPropertyNames(globalThis)) {
    if (key in window) {
      continue;
    }
    tryTo(() =>
      Object.defineProperty(window, key, {
        configurable: true,
        get: () => globals[key],
        set: (value: unknown) => {
          globals[key] = value;
        },
      }),
    );
  }
}

function createDom(): Jsdom.JSDOM {
  return new JSDOM("<!DOCTYPE html><html><head></head><body></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });
}

function replaceNodeFetch(): void {
  // Node defines these lazily, and the first touch of any of them loads its
  // fetch implementation, which reads AbortSignal. They are touched while
  // Node's AbortSignal still exists, or the deletion below fails silently.
  for (const name of [
    ...NODE_FETCH_GLOBALS,
    "MessageEvent",
    "WebSocket",
    "EventSource",
    "CloseEvent",
  ]) {
    void globals[name];
  }
  for (const name of NODE_FETCH_GLOBALS) {
    Reflect.deleteProperty(globalThis, name);
  }
}

// jsdom itself calls setImmediate, from the same global object, so these two
// stay available to the runtime and are hidden from the code under test.
function hideImmediateFromCodeUnderTest(): void {
  for (const name of ["setImmediate", "clearImmediate"]) {
    const original = globals[name];
    Object.defineProperty(globalThis, name, {
      configurable: true,
      enumerable: false,
      get: () => (isCalledFromRuntime() ? original : undefined),
      set: (value: unknown) => {
        Object.defineProperty(globalThis, name, {
          configurable: true,
          writable: true,
          enumerable: false,
          value,
        });
      },
    });
  }
}

/**
 * Whether the caller of the function that calls this is jsdom, Node or the
 * runner, as opposed to the code under test.
 */
export function isCalledFromRuntime(depth = 3): boolean {
  const caller = (new Error().stack ?? "").split("\n")[depth] ?? "";
  return (
    caller.includes("/node_modules/jsdom/") ||
    caller.includes("node:") ||
    caller.includes(runnerDirectory + path.sep)
  );
}

function keysOfWindow(window: Jsdom.DOMWindow): Set<string> {
  const keys = new Set<string>();
  for (
    let prototype: object | null = window;
    prototype && prototype !== Object.prototype;
    prototype = Object.getPrototypeOf(prototype)
  ) {
    for (const key of Object.getOwnPropertyNames(prototype)) {
      keys.add(key);
    }
  }
  return keys;
}

function installWindowGlobals({ again }: { again: boolean }): void {
  const window = propertiesOf(dom.window);
  for (const key of windowKeys) {
    const isNew = !(key in globalThis);
    const isReplaced =
      windowGlobals.has(key) || (again && installedWindowKeys.has(key));
    if (nodeGlobals.has(key) || (!isNew && !isReplaced)) {
      continue;
    }
    installedWindowKeys.add(key);
    installWindowGlobal(window, key);
  }
  for (const alias of WINDOW_ALIASES) {
    Object.defineProperty(globalThis, alias, {
      value: globalThis,
      configurable: true,
      writable: true,
    });
  }
  // A timer that code takes from the window is the global one, which a fake
  // clock replaces.
  for (const name of TIMER_GLOBALS) {
    Object.defineProperty(window, name, {
      get: () => globals[name],
      configurable: true,
    });
  }
}

function installWindowGlobal(
  window: Record<PropertyKey, unknown>,
  key: string,
): void {
  // An event handler property such as onkeydown is an accessor on the window.
  // Copied as a value it would have no setter, and assigning to it would never
  // reach the window.
  const descriptor = Object.getOwnPropertyDescriptor(dom.window, key);
  if (/^on[a-z]+$/.test(key) && descriptor?.set) {
    try {
      Object.defineProperty(globalThis, key, {
        configurable: true,
        enumerable: descriptor.enumerable,
        get: () => propertiesOf(dom.window)[key],
        set: (handler: unknown) => {
          propertiesOf(dom.window)[key] = handler;
        },
      });
      return;
    } catch {
      // Copied as a value below instead.
    }
  }

  let value: unknown;
  try {
    value = window[key];
  } catch {
    // A getter that throws without a document behind it has nothing to copy.
    return;
  }
  // A package that saved a window function when it loaded (Mantine's
  // `const raf = window.requestAnimationFrame`) must still reach the current
  // window, so the global is a forwarder that outlives the window.
  const isMethod = typeof value === "function" && !/^[A-Z]/.test(key);
  tryTo(() =>
    Object.defineProperty(globalThis, key, {
      value: isMethod ? forwarderFor(key) : value,
      writable: true,
      configurable: true,
      enumerable: false,
    }),
  );
}

function forwarderFor(key: string): (...args: unknown[]) => unknown {
  let forwarder = forwarders.get(key);
  if (!forwarder) {
    forwarder = (...args) => {
      const method = propertiesOf(dom.window)[key];
      return typeof method === "function"
        ? method.apply(dom.window, args)
        : undefined;
    };
    forwarders.set(key, forwarder);
  }
  return forwarder;
}
