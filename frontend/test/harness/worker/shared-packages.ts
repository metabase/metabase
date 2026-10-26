// Resets for state that specs leave in packages that stay loaded: the canvas
// mocks, Testing Library's configuration and screen, and the focus and
// clipboard of the document.
import { createRequire } from "node:module";
import path from "node:path";

import type * as TestingLibraryDom from "@testing-library/dom";
import type * as TestingLibraryReact from "@testing-library/react";

import { root } from "../jest-config.ts";

import { currentWindow } from "./dom.ts";
import { tryTo } from "./properties.ts";

type MockFunction = ((...args: unknown[]) => unknown) & {
  _isMockFunction?: boolean;
  getMockImplementation?: () => ((...args: unknown[]) => unknown) | undefined;
  mockImplementation?: (
    implementation: (...args: unknown[]) => unknown,
  ) => void;
};
type GetContext = HTMLCanvasElement["getContext"] & {
  remembersContexts?: boolean;
};

const require = createRequire(import.meta.url);
const requireFromRoot = createRequire(path.join(root, "package.json"));

// The chart library keeps one canvas context for measuring text. Its methods
// are mocks from jest-canvas-mock, and a spec's resetAllMocks strips their
// implementations for good. Each context's mocks are remembered as it is
// handed out, and their implementations go back between files.
const canvasMocks: Array<
  [WeakRef<MockFunction>, (...args: unknown[]) => unknown]
> = [];
const rememberedContexts = new WeakSet<object>();
let testingLibraryConfig: TestingLibraryReact.Config | null = null;

export function rememberCanvasMocks(): void {
  const prototype = currentWindow().HTMLCanvasElement.prototype;
  const getContext: GetContext = prototype.getContext;
  if (typeof getContext !== "function" || getContext.remembersContexts) {
    return;
  }
  const remembering: GetContext = Object.assign(
    function (this: HTMLCanvasElement, ...args: Parameters<GetContext>) {
      const context = getContext.apply(this, args);
      rememberContext(context);
      return context;
    },
    getContext,
    { remembersContexts: true },
  );
  prototype.getContext = remembering;
}

export function restoreCanvasMocks(): void {
  let kept = 0;
  for (const entry of canvasMocks) {
    const [reference, implementation] = entry;
    const mock = reference.deref();
    if (!mock) {
      continue;
    }
    if (!mock.getMockImplementation?.()) {
      mock.mockImplementation?.(implementation);
    }
    canvasMocks[kept] = entry;
    kept += 1;
  }
  canvasMocks.length = kept;
}

/**
 * A spec that calls configure() changes the configuration of the one shared
 * copy of React Testing Library. The first call records it.
 */
export function resetTestingLibraryConfig(): void {
  if (process.env.NT_RELOAD_TESTING_LIBRARY) return;
  const library: typeof TestingLibraryReact = requireFromRoot(
    "@testing-library/react",
  );
  if (testingLibraryConfig === null) {
    testingLibraryConfig = { ...library.getConfig() };
    return;
  }
  const baseline = testingLibraryConfig;
  const current = library.getConfig();
  const changed = Object.keys(baseline).some(
    (key) => Reflect.get(current, key) !== Reflect.get(baseline, key),
  );
  if (changed) {
    library.configure({ ...baseline });
  }
}

/**
 * Testing Library builds `screen` from document.body when it loads. The
 * package stays loaded, so its queries are bound again to the body of each
 * new window.
 */
export function pointScreenAtNewDocument(): void {
  if (process.env.NT_RELOAD_TESTING_LIBRARY) return;
  for (const file of Object.keys(require.cache)) {
    if (!file.endsWith("/@testing-library/dom/dist/screen.js")) {
      continue;
    }
    const library: typeof TestingLibraryDom = require(
      path.join(path.dirname(file), "index.js"),
    );
    Object.assign(
      library.screen,
      library.getQueriesForElement(
        currentWindow().document.body,
        library.queries,
      ),
    );
  }
}

/**
 * jsdom leaves activeElement pointing at a removed node, and user-event then
 * refuses to focus anything in the next file.
 */
export function resetFocus(): void {
  const { document } = currentWindow();
  if (document.activeElement === document.body) {
    return;
  }
  if (Object.getOwnPropertyDescriptor(document, "activeElement")) {
    tryTo(() => Reflect.deleteProperty(document, "activeElement"));
  }
}

/**
 * user-event installs a getter-only navigator.clipboard, and a setup file
 * assigns to that property, so running the setup files again throws unless
 * it is dropped.
 */
export function resetClipboard(): void {
  const { navigator } = currentWindow();
  const descriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  if (descriptor && (descriptor.get || descriptor.writable === false)) {
    tryTo(() => Reflect.deleteProperty(navigator, "clipboard"));
  }
}

function rememberContext(context: unknown): void {
  if (
    typeof context !== "object" ||
    context === null ||
    rememberedContexts.has(context)
  ) {
    return;
  }
  rememberedContexts.add(context);
  for (const key of Object.keys(context)) {
    const method: unknown = Reflect.get(context, key);
    if (!isMockFunction(method)) {
      continue;
    }
    const implementation = method.getMockImplementation?.();
    if (implementation) {
      canvasMocks.push([new WeakRef(method), implementation]);
    }
  }
}

function isMockFunction(value: unknown): value is MockFunction {
  return (
    typeof value === "function" &&
    Reflect.get(value, "_isMockFunction") === true
  );
}
