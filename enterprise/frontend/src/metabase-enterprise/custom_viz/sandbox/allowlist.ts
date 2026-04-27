import {
  allClassMethodsOf,
  allGettersAndMethodsOf,
  allGettersOf,
  allMembersOf,
  allMethodsOf,
  entireClassOf,
  getterOf,
} from "./helpers";

// Native references shared with distortions.ts so identity comparisons match.
export const CREATE_ELEMENT = Document.prototype.createElement;
export const CREATE_ELEMENT_NS = Document.prototype.createElementNS;
export const INSERT_ADJACENT_HTML = Element.prototype.insertAdjacentHTML;

// %TypedArray%.prototype is not directly referenceable — it's the shared hidden prototype
// that all typed array classes (Int8Array, Float64Array, etc.) inherit from.
function getTypedArrayPrototype(): object {
  return Object.getPrototypeOf(Int8Array.prototype);
}

const CONSOLE_METHODS = [
  // eslint-disable-next-line no-console -- plugin sandboxes may log for debugging
  console.log,
  console.warn,
  console.error,
  // eslint-disable-next-line no-console -- plugin sandboxes may log for debugging
  console.info,
];

// ECMAScript built-ins — covered wholesale to avoid whack-a-mole with getTime, map, slice, parse, etc.
const ECMASCRIPT_BUILT_IN_METHODS = [
  ...allClassMethodsOf(Date),
  ...allClassMethodsOf(Array),
  ...allClassMethodsOf(String),
  ...allClassMethodsOf(Number),
  ...allClassMethodsOf(Boolean),
  ...allClassMethodsOf(Object),
  ...allClassMethodsOf(Function),
  ...allClassMethodsOf(RegExp),
  ...allClassMethodsOf(Promise),
  ...allClassMethodsOf(Map),
  ...allClassMethodsOf(Set),
  ...allClassMethodsOf(WeakMap),
  ...allClassMethodsOf(WeakSet),
  ...allClassMethodsOf(Error),
  ...allClassMethodsOf(ArrayBuffer),
  ...allClassMethodsOf(DataView),
  ...allMethodsOf(getTypedArrayPrototype()),
  ...allMethodsOf(Math),
  ...allMethodsOf(JSON),
];

// TypedArray constructors — all pass [native code] check when accessed via window.
const TYPED_ARRAY_CONSTRUCTORS = [
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
];

// DOM prototype methods, getters, and setters — manipulation and traversal APIs.
const DOM_PROTOTYPE_FUNCTIONS = [
  ...allMembersOf(Document.prototype),
  ...allMembersOf(Node.prototype),
  ...allMembersOf(Element.prototype),
  ...allMembersOf(HTMLElement.prototype),
  ...allMethodsOf(EventTarget.prototype),
  ...allGettersOf(EventTarget.prototype),
  ...allGettersOf(Navigator.prototype),
  ...allGettersOf(Screen.prototype),
];

// Event hierarchy — plugin event handlers read type, target, clientX/Y, etc.
const EVENT_PROTOTYPE_FUNCTIONS = [
  ...allGettersAndMethodsOf(Event.prototype),
  ...allGettersAndMethodsOf(UIEvent.prototype),
  ...allGettersAndMethodsOf(MouseEvent.prototype),
  ...allGettersAndMethodsOf(PointerEvent.prototype),
  ...allGettersAndMethodsOf(WheelEvent.prototype),
  ...allGettersAndMethodsOf(KeyboardEvent.prototype),
  ...allGettersAndMethodsOf(TouchEvent.prototype),
  ...allGettersAndMethodsOf(Touch.prototype),
];

// WebKitCSSMatrix is non-standard and absent in non-WebKit browsers.
const WebKitCSSMatrix = (
  window as unknown as {
    WebKitCSSMatrix?: object & { prototype: object };
  }
).WebKitCSSMatrix;

// Canvas + CSS geometry — 2D context, canvas element, style declarations,
// and the matrix/rect constructors used by animation/transform libraries.
const CANVAS_AND_GEOMETRY_FUNCTIONS = [
  ...entireClassOf(DOMMatrix),
  ...entireClassOf(DOMPoint),
  ...entireClassOf(DOMRect),
  ...entireClassOf(DOMRectReadOnly),
  ...entireClassOf(HTMLCanvasElement),
  ...entireClassOf(CanvasRenderingContext2D),
  ...entireClassOf(CSSStyleDeclaration),
  ...entireClassOf(TextMetrics),
  ...entireClassOf(ResizeObserverEntry),
  ...(WebKitCSSMatrix ? entireClassOf(WebKitCSSMatrix) : []),
];

// Covers what plugin code + bundled libs call directly.
// Endowments (__METABASE_VIZ_API__, __customVizPlugin__) are exempt —
// they are injected directly and never pass through distortionCallback.
export const ALLOWED_FUNCTIONS = new Set<object>(
  [
    CREATE_ELEMENT,
    CREATE_ELEMENT_NS,
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
    getterOf("navigator"),
    getterOf("location"),
    getterOf("screen"),
    getterOf("devicePixelRatio"),
    getterOf("innerWidth"),
    getterOf("innerHeight"),
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
    ...CONSOLE_METHODS,
    ...ECMASCRIPT_BUILT_IN_METHODS,
    ...TYPED_ARRAY_CONSTRUCTORS,
    ...DOM_PROTOTYPE_FUNCTIONS,
    ...EVENT_PROTOTYPE_FUNCTIONS,
    ...CANVAS_AND_GEOMETRY_FUNCTIONS,
  ].filter(Boolean) as object[],
);
