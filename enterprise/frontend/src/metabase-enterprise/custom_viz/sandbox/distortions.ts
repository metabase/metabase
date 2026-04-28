import {
  ALLOWED_FUNCTIONS,
  CREATE_ELEMENT,
  INSERT_ADJACENT_HTML,
  SET_ATTRIBUTE,
  SET_ATTRIBUTE_NS,
} from "./allowlist";
import { getFunctionName } from "./debugging";

export function makeDistortionCallback(pluginId: string) {
  return function distortionCallback(fun: object): object {
    if (typeof fun !== "function") {
      return fun;
    }

    if (isUserDefinedFunction(fun)) {
      return fun;
    }

    if (fun === CANVAS_WIDTH_SETTER) {
      return canvasWidthSetterDistortion;
    }

    if (fun === CANVAS_HEIGHT_SETTER) {
      return canvasHeightSetterDistortion;
    }

    if (SANITIZED_SETTERS.has(fun)) {
      return SANITIZED_SETTERS.get(fun) as object;
    }

    if (fun === CREATE_ELEMENT) {
      return createElementDistortion(pluginId);
    }

    if (fun === INSERT_ADJACENT_HTML) {
      return insertAdjacentHTMLDistortion();
    }

    if (fun === SET_ATTRIBUTE) {
      return setAttributeDistortion(pluginId);
    }

    if (fun === SET_ATTRIBUTE_NS) {
      return setAttributeNSDistortion(pluginId);
    }

    if (ALLOWED_FUNCTIONS.has(fun)) {
      return fun;
    }

    const name = getFunctionName(fun);
    return function blocked() {
      throw new Error(`[plugin ${pluginId}] blocked API call: ${name}`);
    };
  };
}

// User-space JS functions stringify to their actual source; native built-ins
// (`fetch`, `XMLHttpRequest`, `document.createElement`, …) stringify with the
// `[native code]` marker. Anything outside that marker can't do I/O on its
// own — to be dangerous it must eventually call a native, which crosses the
// membrane again and gets gated then. So user-defined functions can pass
// through here without consulting the allowlist.
//
// Bound functions (`Function.prototype.bind`) also stringify with
// `[native code]` even though they wrap user code (e.g. React's bound
// dispatchSetState), but their `.name` is prefixed with `bound ` — we treat
// those as user-defined too.
function isUserDefinedFunction(fun: object): boolean {
  if (!Function.prototype.toString.call(fun).includes("[native code]")) {
    return true;
  }
  const fname = Object.getOwnPropertyDescriptor(fun, "name")?.value;
  return fname.startsWith("bound ");
}

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

function canvasWidthSetterDistortion(this: HTMLCanvasElement, value: number) {
  CANVAS_WIDTH_SETTER!.call(this, value);
  this.style.width = `${value / window.devicePixelRatio}px`;
}

function canvasHeightSetterDistortion(this: HTMLCanvasElement, value: number) {
  CANVAS_HEIGHT_SETTER!.call(this, value);
  this.style.height = `${value / window.devicePixelRatio}px`;
}

// Tags that must never be created — they can load or execute arbitrary code.
const BLOCKED_TAGS = new Set([
  "script",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "base",
]);

function createElementDistortion(pluginId: string) {
  return function createElement(
    this: Document,
    tag: string,
    options?: ElementCreationOptions,
  ) {
    if (BLOCKED_TAGS.has(tag.toLowerCase())) {
      throw new Error(`[plugin ${pluginId}] blocked createElement: ${tag}`);
    }
    return CREATE_ELEMENT.call(this, tag, options as ElementCreationOptions);
  };
}

// Inline `on*` handler attributes execute as JavaScript when the element is
// wired up — equivalent to `eval` on a string. Block them at the setAttribute
// boundary; legitimate event listeners use addEventListener instead.
function isInlineEventHandlerName(name: unknown): boolean {
  return typeof name === "string" && /^on/i.test(name);
}

function setAttributeDistortion(pluginId: string) {
  return function setAttribute(this: Element, name: string, value: string) {
    if (isInlineEventHandlerName(name)) {
      throw new Error(
        `[plugin ${pluginId}] blocked setAttribute for inline event handler: ${name}`,
      );
    }
    return SET_ATTRIBUTE.call(this, name, value);
  };
}

function setAttributeNSDistortion(pluginId: string) {
  return function setAttributeNS(
    this: Element,
    namespace: string | null,
    qualifiedName: string,
    value: string,
  ) {
    if (isInlineEventHandlerName(qualifiedName)) {
      throw new Error(
        `[plugin ${pluginId}] blocked setAttributeNS for inline event handler: ${qualifiedName}`,
      );
    }
    return SET_ATTRIBUTE_NS.call(this, namespace, qualifiedName, value);
  };
}

function insertAdjacentHTMLDistortion() {
  return function insertAdjacentHTML(
    this: Element,
    position: InsertPosition,
    html: string,
  ) {
    const purify = (
      window as unknown as {
        DOMPurify?: { sanitize: (v: string) => string };
      }
    ).DOMPurify;
    INSERT_ADJACENT_HTML.call(
      this,
      position,
      purify ? purify.sanitize(html) : html,
    );
  };
}
