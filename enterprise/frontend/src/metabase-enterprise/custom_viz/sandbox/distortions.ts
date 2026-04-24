import { ALLOWED_FUNCTIONS } from "./allowlist";

const FUNCTION_NAMES: WeakMap<object, string> = (() => {
  const map = new WeakMap<object, string>();
  const targets: Array<[object, string]> = [
    [window, "window"],
    [Window.prototype, "Window"],
    [EventTarget.prototype, "EventTarget"],
    [Node.prototype, "Node"],
    [Element.prototype, "Element"],
    [HTMLElement.prototype, "HTMLElement"],
    [Document.prototype, "Document"],
    [Navigator.prototype, "Navigator"],
    [Screen.prototype, "Screen"],
    [CanvasRenderingContext2D.prototype, "CanvasRenderingContext2D"],
    [HTMLCanvasElement.prototype, "HTMLCanvasElement"],
    [SVGElement.prototype, "SVGElement"],
    [Event.prototype, "Event"],
    [UIEvent.prototype, "UIEvent"],
    [MouseEvent.prototype, "MouseEvent"],
    [PointerEvent.prototype, "PointerEvent"],
    [WheelEvent.prototype, "WheelEvent"],
    [KeyboardEvent.prototype, "KeyboardEvent"],
    [TouchEvent.prototype, "TouchEvent"],
    [Touch.prototype, "Touch"],
    [CSSStyleDeclaration.prototype, "CSSStyleDeclaration"],
    [DOMRect.prototype, "DOMRect"],
    [DOMRectReadOnly.prototype, "DOMRectReadOnly"],
    [TextMetrics.prototype, "TextMetrics"],
    [ResizeObserverEntry.prototype, "ResizeObserverEntry"],
  ];
  for (const [owner, prefix] of targets) {
    for (const key of Object.getOwnPropertyNames(owner)) {
      const descriptor = Object.getOwnPropertyDescriptor(owner, key);
      if (!descriptor) {
        continue;
      }
      if (typeof descriptor.value === "function") {
        map.set(descriptor.value, `${prefix}.${key}`);
      }
      if (typeof descriptor.get === "function") {
        map.set(descriptor.get, `${prefix}.get ${key}`);
      }
    }
  }
  return map;
})();

// Wraps innerHTML/outerHTML through DOMPurify before they reach the DOM.
const SANITIZED_SETTERS = new Map<
  object,
  (this: Element, value: string) => void
>();
for (const key of ["innerHTML", "outerHTML"] as const) {
  const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, key);
  if (descriptor?.set) {
    const originalSet = descriptor.set;
    SANITIZED_SETTERS.set(
      descriptor.set,
      function (this: Element, value: string) {
        const purify = (
          window as unknown as {
            DOMPurify?: { sanitize: (v: string) => string };
          }
        ).DOMPurify;
        originalSet.call(this, purify ? purify.sanitize(value) : value);
      },
    );
  }
}

// CSSStyleDeclaration WebIDL proxy workaround: intercept width/height on the real canvas node.
const CANVAS_WIDTH_SETTER = Object.getOwnPropertyDescriptor(
  HTMLCanvasElement.prototype,
  "width",
)?.set;
const CANVAS_HEIGHT_SETTER = Object.getOwnPropertyDescriptor(
  HTMLCanvasElement.prototype,
  "height",
)?.set;

export function makeDistortionCallback(pluginId: string) {
  return function distortionCallback(v: object): object {
    if (typeof v !== "function") {
      return v;
    }
    try {
      if (!Function.prototype.toString.call(v).includes("[native code]")) {
        return v;
      }
    } catch {
      return v;
    }
    // Symbol-keyed methods (e.g. [Symbol.toPrimitive], [Symbol.iterator]) are
    // ECMAScript built-ins called implicitly by the engine — not browser APIs.
    // Bound functions (name starts with "bound ") also report [native code] but
    // are user-space wrappers (e.g. React's bound dispatchSetState) — must pass through.
    const fname = (v as { name?: string }).name ?? "";
    if (fname.startsWith("[Symbol.") || fname.startsWith("bound ")) {
      return v;
    }
    if (v === CANVAS_WIDTH_SETTER) {
      return function (this: HTMLCanvasElement, value: number) {
        CANVAS_WIDTH_SETTER!.call(this, value);
        this.style.width = `${value / window.devicePixelRatio}px`;
      };
    }
    if (v === CANVAS_HEIGHT_SETTER) {
      return function (this: HTMLCanvasElement, value: number) {
        CANVAS_HEIGHT_SETTER!.call(this, value);
        this.style.height = `${value / window.devicePixelRatio}px`;
      };
    }
    if (SANITIZED_SETTERS.has(v)) {
      return SANITIZED_SETTERS.get(v) as object;
    }
    if (ALLOWED_FUNCTIONS.has(v)) {
      return v;
    }
    const name =
      FUNCTION_NAMES.get(v) || (v as { name?: string }).name || "unknown";
    return function blocked() {
      throw new Error(`[plugin ${pluginId}] blocked API call: ${name}`);
    };
  };
}
