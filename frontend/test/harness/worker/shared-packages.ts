// Resets for state that specs leave in packages that stay loaded: the canvas
// mocks, and the focus and clipboard of the document.
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

// The chart library keeps one canvas context for measuring text. Its methods
// are mocks from jest-canvas-mock, and a spec's resetAllMocks strips their
// implementations for good. Each context's mocks are remembered as it is
// handed out, and their implementations go back between files.
const canvasMocks: Array<
  [WeakRef<MockFunction>, (...args: unknown[]) => unknown]
> = [];
const rememberedContexts = new WeakSet<object>();

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
