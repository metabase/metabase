function ownFunctionsOf(
  obj: object,
  pick: (d: PropertyDescriptor) => unknown,
): object[] {
  return Object.getOwnPropertyNames(obj).flatMap((key) => {
    const d = Object.getOwnPropertyDescriptor(obj, key);
    const fn = d && pick(d);
    return typeof fn === "function" ? [fn] : [];
  });
}

export function getterOf(key: string): object | undefined {
  return (
    Object.getOwnPropertyDescriptor(window, key)?.get ??
    Object.getOwnPropertyDescriptor(Window.prototype, key)?.get
  );
}

export function allGettersOf(proto: object): object[] {
  return ownFunctionsOf(proto, (d) => d.get);
}

export function allMethodsOf(obj: object): object[] {
  return ownFunctionsOf(obj, (d) => d.value);
}

export function allSettersOf(proto: object): object[] {
  return ownFunctionsOf(proto, (d) => d.set);
}

const CONSOLE_METHODS = [
  // eslint-disable-next-line no-console -- plugin sandboxes may log for debugging
  console.log,
  console.warn,
  console.error,
  // eslint-disable-next-line no-console -- plugin sandboxes may log for debugging
  console.info,
];

// Covers what plugin code + bundled libs call directly.
// Endowments (__METABASE_VIZ_API__, __customVizPlugin__) are exempt —
// they are injected directly and never pass through distortionCallback.
export const ALLOWED_FUNCTIONS = new Set<object>(
  [
    document.createElement,
    document.createElementNS,
    document.createTextNode,
    document.createDocumentFragment,
    document.getElementById,
    document.querySelector,
    document.querySelectorAll,
    window.getComputedStyle,
    window.requestAnimationFrame,
    window.cancelAnimationFrame,
    window.ResizeObserver,
    window.MutationObserver,
    window.IntersectionObserver,
    ...CONSOLE_METHODS,
    getterOf("navigator"),
    getterOf("location"),
    getterOf("screen"),
    getterOf("devicePixelRatio"),
    getterOf("innerWidth"),
    getterOf("innerHeight"),
    window.Date,
    window.setTimeout,
    window.clearTimeout,
    window.setInterval,
    window.clearInterval,
    window.queueMicrotask,
    window.URL,
    window.URLSearchParams,
    window.TextEncoder,
    window.TextDecoder,
    window.performance,
    // ECMAScript built-ins — covered wholesale to avoid whack-a-mole with getTime, map, slice, parse, etc.
    ...allMethodsOf(Date.prototype),
    ...allMethodsOf(Date),
    ...allMethodsOf(Array.prototype),
    ...allMethodsOf(Array),
    ...allMethodsOf(String.prototype),
    ...allMethodsOf(String),
    ...allMethodsOf(Number.prototype),
    ...allMethodsOf(Number),
    ...allMethodsOf(Boolean.prototype),
    ...allMethodsOf(Object.prototype),
    ...allMethodsOf(Object),
    ...allMethodsOf(Function.prototype),
    ...allMethodsOf(RegExp.prototype),
    ...allMethodsOf(Promise.prototype),
    ...allMethodsOf(Promise),
    ...allMethodsOf(Map.prototype),
    ...allMethodsOf(Set.prototype),
    ...allMethodsOf(WeakMap.prototype),
    ...allMethodsOf(WeakSet.prototype),
    ...allMethodsOf(Error.prototype),
    ...allMethodsOf(ArrayBuffer.prototype),
    ...allMethodsOf(DataView.prototype),
    ...allMethodsOf(Object.getPrototypeOf(Int8Array.prototype)), // %TypedArray%.prototype
    ...allMethodsOf(Math),
    ...allMethodsOf(JSON),
    // TypedArray constructors — all pass [native code] check when accessed via window.
    window.Int8Array,
    window.Uint8Array,
    window.Uint8ClampedArray,
    window.Int16Array,
    window.Uint16Array,
    window.Int32Array,
    window.Uint32Array,
    window.Float32Array,
    window.Float64Array,
    window.BigInt64Array,
    window.BigUint64Array,
    // CSS matrix / geometry constructors — needed by animation/transform libraries.
    window.DOMMatrix,
    window.DOMPoint,
    window.DOMRect,
    (window as unknown as Record<string, unknown>).WebKitCSSMatrix as object,
    // DOM prototype methods, getters, and setters — manipulation and traversal APIs.
    ...allGettersOf(Document.prototype),
    ...allMethodsOf(Document.prototype),
    ...allSettersOf(Document.prototype),
    ...allGettersOf(Node.prototype),
    ...allMethodsOf(Node.prototype),
    ...allSettersOf(Node.prototype),
    ...allGettersOf(Element.prototype),
    ...allMethodsOf(Element.prototype),
    ...allSettersOf(Element.prototype),
    ...allGettersOf(HTMLElement.prototype),
    ...allMethodsOf(HTMLElement.prototype),
    ...allSettersOf(HTMLElement.prototype),
    ...allGettersOf(EventTarget.prototype),
    ...allMethodsOf(EventTarget.prototype),
    // Read-only browser info — getters only, no mutation.
    ...allGettersOf(Navigator.prototype),
    ...allGettersOf(Screen.prototype),
    // Event hierarchy — plugin event handlers read type, target, clientX/Y, etc.
    ...allGettersOf(Event.prototype),
    ...allMethodsOf(Event.prototype),
    ...allGettersOf(UIEvent.prototype),
    ...allMethodsOf(UIEvent.prototype),
    ...allGettersOf(MouseEvent.prototype),
    ...allMethodsOf(MouseEvent.prototype),
    ...allGettersOf(PointerEvent.prototype),
    ...allMethodsOf(PointerEvent.prototype),
    ...allGettersOf(WheelEvent.prototype),
    ...allMethodsOf(WheelEvent.prototype),
    ...allGettersOf(KeyboardEvent.prototype),
    ...allMethodsOf(KeyboardEvent.prototype),
    ...allGettersOf(TouchEvent.prototype),
    ...allMethodsOf(TouchEvent.prototype),
    ...allGettersOf(Touch.prototype),
    // Canvas — 2D context methods, HTMLCanvasElement, and geometry.
    ...allMethodsOf(HTMLCanvasElement.prototype),
    ...allGettersOf(HTMLCanvasElement.prototype),
    ...allSettersOf(HTMLCanvasElement.prototype),
    ...allMethodsOf(CanvasRenderingContext2D.prototype),
    ...allGettersOf(CanvasRenderingContext2D.prototype),
    ...allSettersOf(CanvasRenderingContext2D.prototype),
    ...allGettersOf(TextMetrics.prototype),
    ...allGettersOf(DOMRect.prototype),
    ...allGettersOf(DOMRectReadOnly.prototype),
    ...allGettersOf(ResizeObserverEntry.prototype),
    // CSSStyleDeclaration — style.cssText, style.setProperty, etc.
    ...allGettersOf(CSSStyleDeclaration.prototype),
    ...allMethodsOf(CSSStyleDeclaration.prototype),
    ...allSettersOf(CSSStyleDeclaration.prototype),
  ].filter(Boolean) as object[],
);
