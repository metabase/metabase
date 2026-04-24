import createVirtualEnvironment from "@locker/near-membrane-dom";

// Pre-built map from function reference → "Owner.propertyName" for readable
// blocked-call messages. Built once at module load time.
// Uses getOwnPropertyDescriptor so getter functions are captured directly
// instead of being invoked (which would return the value, not the function).
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

// Resolves a property getter without invoking it, checking both the instance
// and its prototype (browsers differ on where they define window properties).
function getterOf(key: string): object | undefined {
  return (
    Object.getOwnPropertyDescriptor(window, key)?.get ??
    Object.getOwnPropertyDescriptor(Window.prototype, key)?.get
  );
}

// Returns all getter functions defined on a prototype object.
function allGettersOf(proto: object): object[] {
  return Object.getOwnPropertyNames(proto).flatMap(key => {
    const get = Object.getOwnPropertyDescriptor(proto, key)?.get;
    return get ? [get] : [];
  });
}

// Returns all value-type functions on an object (prototype methods or static methods).
function allMethodsOf(obj: object): object[] {
  return Object.getOwnPropertyNames(obj).flatMap(key => {
    const fn = Object.getOwnPropertyDescriptor(obj, key)?.value;
    return fn && typeof fn === "function" ? [fn] : [];
  });
}

// Returns all setter functions defined on a prototype object.
function allSettersOf(proto: object): object[] {
  return Object.getOwnPropertyNames(proto).flatMap(key => {
    const set = Object.getOwnPropertyDescriptor(proto, key)?.set;
    return set ? [set] : [];
  });
}

// innerHTML/outerHTML setters run through DOMPurify before reaching the DOM.
// Checked before ALLOWED_FUNCTIONS so the sanitized wrapper wins even though
// allSettersOf(Element.prototype) includes the raw setter in the allowlist.
const SANITIZED_SETTERS = new Map<object, (this: Element, value: string) => void>();
for (const key of ["innerHTML", "outerHTML"] as const) {
  const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, key);
  if (descriptor?.set) {
    const originalSet = descriptor.set;
    SANITIZED_SETTERS.set(descriptor.set, function (this: Element, value: string) {
      const purify = (window as unknown as { DOMPurify?: { sanitize: (v: string) => string } }).DOMPurify;
      originalSet.call(this, purify ? purify.sanitize(value) : value);
    });
  }
}

// CSSStyleDeclaration named property [[Set]] (e.g. style.width = '1004px') does not
// propagate through near-membrane's Proxy because CSSStyleDeclaration uses WebIDL
// exotic-object semantics — the native [[Set]] checks that the receiver IS the
// CSSStyleDeclaration, not a Proxy of one, and silently does nothing.
// Fix: intercept canvas.width / canvas.height setters. near-membrane calls our
// replacement with `this` = the real blue-realm canvas (not a proxy), so we can
// safely call `this.style.width = …` directly on the real DOM node, bypassing
// the membrane entirely for the CSS assignment.
const CANVAS_WIDTH_SETTER = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "width")?.set;
const CANVAS_HEIGHT_SETTER = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "height")?.set;

// Functions plugin code is allowed to call directly from the host window.
// Endowments (__METABASE_VIZ_API__, __customVizPlugin__) are exempt —
// they are injected directly and never pass through distortionCallback.
// React's internal DOM calls also don't pass through (it runs in the blue realm).
// This list only needs to cover what plugin code + bundled libs call directly.
const ALLOWED_FUNCTIONS = new Set<object>(
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
    console.log,
    console.warn,
    console.error,
    console.info,
    // Window property getters — reading `window.navigator` etc. invokes the
    // native getter, which shows up in distortionCallback as a function.
    getterOf("navigator"),
    getterOf("location"),
    getterOf("screen"),
    getterOf("devicePixelRatio"),
    getterOf("innerWidth"),
    getterOf("innerHeight"),
    // JS built-ins that live on window and pass the native-code check.
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
    // ECMAScript built-in prototype methods and static methods — not browser APIs,
    // always safe. Covering these wholesale avoids whack-a-mole with getTime,
    // map, slice, parse, etc.
    ...allMethodsOf(Date.prototype),    ...allMethodsOf(Date),
    ...allMethodsOf(Array.prototype),   ...allMethodsOf(Array),
    ...allMethodsOf(String.prototype),  ...allMethodsOf(String),
    ...allMethodsOf(Number.prototype),  ...allMethodsOf(Number),
    ...allMethodsOf(Boolean.prototype),
    ...allMethodsOf(Object.prototype),  ...allMethodsOf(Object),
    ...allMethodsOf(Function.prototype),
    ...allMethodsOf(RegExp.prototype),
    ...allMethodsOf(Promise.prototype), ...allMethodsOf(Promise),
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
    window.Int8Array, window.Uint8Array, window.Uint8ClampedArray,
    window.Int16Array, window.Uint16Array,
    window.Int32Array, window.Uint32Array,
    window.Float32Array, window.Float64Array,
    window.BigInt64Array, window.BigUint64Array,
    // CSS matrix / geometry constructors — needed by animation/transform libraries.
    window.DOMMatrix,
    window.DOMPoint,
    window.DOMRect,
    (window as unknown as Record<string, unknown>).WebKitCSSMatrix as object,
    // DOM prototype methods, getters, and setters — manipulation and traversal APIs.
    ...allGettersOf(Document.prototype),    ...allMethodsOf(Document.prototype),    ...allSettersOf(Document.prototype),
    ...allGettersOf(Node.prototype),        ...allMethodsOf(Node.prototype),         ...allSettersOf(Node.prototype),
    ...allGettersOf(Element.prototype),     ...allMethodsOf(Element.prototype),      ...allSettersOf(Element.prototype),
    ...allGettersOf(HTMLElement.prototype), ...allMethodsOf(HTMLElement.prototype),  ...allSettersOf(HTMLElement.prototype),
    ...allGettersOf(EventTarget.prototype), ...allMethodsOf(EventTarget.prototype),
    // Read-only browser info — getters only, no mutation.
    ...allGettersOf(Navigator.prototype),
    ...allGettersOf(Screen.prototype),
    // Event hierarchy — plugin event handlers read type, target, clientX/Y, etc.
    ...allGettersOf(Event.prototype),     ...allMethodsOf(Event.prototype),
    ...allGettersOf(UIEvent.prototype),   ...allMethodsOf(UIEvent.prototype),
    ...allGettersOf(MouseEvent.prototype), ...allMethodsOf(MouseEvent.prototype),
    ...allGettersOf(PointerEvent.prototype), ...allMethodsOf(PointerEvent.prototype),
    ...allGettersOf(WheelEvent.prototype), ...allMethodsOf(WheelEvent.prototype),
    ...allGettersOf(KeyboardEvent.prototype), ...allMethodsOf(KeyboardEvent.prototype),
    ...allGettersOf(TouchEvent.prototype), ...allMethodsOf(TouchEvent.prototype),
    ...allGettersOf(Touch.prototype),
    // Canvas APIs
    ...allMethodsOf(HTMLCanvasElement.prototype), ...allGettersOf(HTMLCanvasElement.prototype), ...allSettersOf(HTMLCanvasElement.prototype),
    ...allMethodsOf(CanvasRenderingContext2D.prototype), ...allGettersOf(CanvasRenderingContext2D.prototype), ...allSettersOf(CanvasRenderingContext2D.prototype),
    ...allGettersOf(TextMetrics.prototype),
    ...allGettersOf(DOMRect.prototype), ...allGettersOf(DOMRectReadOnly.prototype),
    ...allGettersOf(ResizeObserverEntry.prototype),
    // CSSStyleDeclaration — style.cssText, style.setProperty, etc.
    ...allGettersOf(CSSStyleDeclaration.prototype), ...allMethodsOf(CSSStyleDeclaration.prototype), ...allSettersOf(CSSStyleDeclaration.prototype),
  ].filter(Boolean) as object[],
);

export function createPluginSandbox(pluginId: string) {
  let capturedFactory: unknown;

  const env = createVirtualEnvironment(window, {
    distortionCallback(v: object) {
      if (typeof v !== "function") {
        return v;
      }
      // Only intercept native browser APIs. near-membrane generates its own
      // internal accessor closures (e.g. `() => value[key]`) that are regular
      // JS functions — letting them through is required for the membrane to work.
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
      // Intercept canvas buffer setters — see CANVAS_WIDTH_SETTER comment above.
      // near-membrane passes `this` as the real blue-realm canvas, so we can touch
      // this.style directly without going through the membrane.
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
      // Regular function (not arrow) so `new blockedFn()` also throws our
      // message instead of "is not a constructor".
      return function blocked() {
        throw new Error(`[plugin ${pluginId}] blocked API call: ${name}`);
      };
    },
    endowments: Object.getOwnPropertyDescriptors({
      get __customVizPlugin__() {
        return capturedFactory;
      },
      set __customVizPlugin__(value: unknown) {
        capturedFactory = value;
      },
      __METABASE_VIZ_API__: window.__METABASE_VIZ_API__,
    }),
  });

  return {
    evaluate(code: string): unknown {
      try {
        env.evaluate(code);
      } catch (e) {
        // Errors thrown inside the membrane are proxied objects — extract what
        // we can and re-throw as a plain blue-realm Error so callers can read it.
        let message: string;
        try {
          message = String((e as { message?: unknown })?.message ?? e);
        } catch {
          message = "Unknown error inside plugin sandbox";
        }
        throw new Error(message);
      }
      return capturedFactory;
    },
  };
}
