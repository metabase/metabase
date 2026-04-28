import {
  allClassMethodsOf,
  allGettersAndMethodsOf,
  allGettersOf,
  allMembersOf,
  allMethodsOf,
  entireClassOf,
  getterFromWindowOf,
} from "./helpers";

// Native references shared with distortions.ts so identity comparisons match.
export const CREATE_ELEMENT = Document.prototype.createElement;
export const INSERT_ADJACENT_HTML = Element.prototype.insertAdjacentHTML;
export const SET_ATTRIBUTE = Element.prototype.setAttribute;
export const SET_ATTRIBUTE_NS = Element.prototype.setAttributeNS;

function getterOf(proto: object, key: string): object | undefined {
  return Object.getOwnPropertyDescriptor(proto, key)?.get;
}

function methodOf(proto: object, key: string): object | undefined {
  return Object.getOwnPropertyDescriptor(proto, key)?.value;
}

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

// Document.prototype — explicit safe members. Blanket allow is unsafe:
// open/write/writeln/close inject HTML or open new browsing contexts;
// cookie get+set leaks/mints session credentials; domain set weakens SOP;
// execCommand/designMode are legacy dangerous edit primitives.
const SAFE_DOCUMENT_FUNCTIONS = [
  CREATE_ELEMENT,
  methodOf(Document.prototype, "createTextNode"),
  methodOf(Document.prototype, "createDocumentFragment"),
  methodOf(Document.prototype, "createComment"),
  methodOf(Document.prototype, "createRange"),
  methodOf(Document.prototype, "createNodeIterator"),
  methodOf(Document.prototype, "createTreeWalker"),
  methodOf(Document.prototype, "createEvent"),
  methodOf(Document.prototype, "getElementById"),
  methodOf(Document.prototype, "getElementsByClassName"),
  methodOf(Document.prototype, "getElementsByTagName"),
  methodOf(Document.prototype, "querySelector"),
  methodOf(Document.prototype, "querySelectorAll"),
  methodOf(Document.prototype, "elementFromPoint"),
  methodOf(Document.prototype, "elementsFromPoint"),
  methodOf(Document.prototype, "hasFocus"),
  methodOf(Document.prototype, "contains"),
  getterOf(Document.prototype, "documentElement"),
  getterOf(Document.prototype, "body"),
  getterOf(Document.prototype, "head"),
  getterOf(Document.prototype, "title"),
  getterOf(Document.prototype, "readyState"),
  getterOf(Document.prototype, "activeElement"),
  getterOf(Document.prototype, "defaultView"),
  getterOf(Document.prototype, "fullscreenElement"),
  getterOf(Document.prototype, "scrollingElement"),
  getterOf(Document.prototype, "visibilityState"),
  getterOf(Document.prototype, "hidden"),
];

// Navigator getters — explicit safe list. Blanket allow exposes
// geolocation, clipboard, mediaDevices, serviceWorker, credentials,
// permissions, usb, bluetooth, share — all credential or device leaks.
const SAFE_NAVIGATOR_GETTERS = [
  getterOf(Navigator.prototype, "userAgent"),
  getterOf(Navigator.prototype, "language"),
  getterOf(Navigator.prototype, "languages"),
  getterOf(Navigator.prototype, "platform"),
  getterOf(Navigator.prototype, "hardwareConcurrency"),
  getterOf(Navigator.prototype, "onLine"),
];

// DOM prototype methods, getters, and setters — manipulation and traversal APIs.
// setAttribute / setAttributeNS on Element are wrapped in distortions.ts to
// reject inline `on*` event-handler attributes.
const DOM_PROTOTYPE_FUNCTIONS = [
  ...SAFE_DOCUMENT_FUNCTIONS,
  ...allMembersOf(Node.prototype),
  ...allMembersOf(Element.prototype),
  ...allMembersOf(HTMLElement.prototype),
  ...allMethodsOf(EventTarget.prototype),
  ...allGettersOf(EventTarget.prototype),
  ...SAFE_NAVIGATOR_GETTERS,
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
];

// Covers what plugin code + bundled libs call directly.
// Endowments (__METABASE_VIZ_API__, __customVizPlugin__) are exempt —
// they are injected directly and never pass through distortionCallback.
export const ALLOWED_FUNCTIONS = new Set<object>(
  [
    window.getComputedStyle,
    window.requestAnimationFrame,
    window.cancelAnimationFrame,
    window.ResizeObserver,
    window.MutationObserver,
    window.IntersectionObserver,
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
    getterFromWindowOf("navigator"),
    getterFromWindowOf("location"),
    getterFromWindowOf("screen"),
    getterFromWindowOf("devicePixelRatio"),
    getterFromWindowOf("innerWidth"),
    getterFromWindowOf("innerHeight"),
    ...CONSOLE_METHODS,
    ...ECMASCRIPT_BUILT_IN_METHODS,
    ...TYPED_ARRAY_CONSTRUCTORS,
    ...DOM_PROTOTYPE_FUNCTIONS,
    ...EVENT_PROTOTYPE_FUNCTIONS,
    ...CANVAS_AND_GEOMETRY_FUNCTIONS,
  ].filter(Boolean) as object[],
);
