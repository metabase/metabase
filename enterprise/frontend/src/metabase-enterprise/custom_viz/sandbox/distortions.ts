import {
  ALLOWED_FUNCTIONS,
  CREATE_ELEMENT,
  INSERT_ADJACENT_HTML,
} from "./allowlist";
import { getFunctionName } from "./debugging";

export function makeDistortionCallback(pluginId: string) {
  return function distortionCallback(fun: object): object {
    if (typeof fun !== "function") {
      return fun;
    }
    try {
      if (!Function.prototype.toString.call(fun).includes("[native code]")) {
        return fun;
      }
    } catch {
      return fun;
    }
    // Bound functions (name starts with "bound ") report [native code] but
    // are user-space wrappers (e.g. React's bound dispatchSetState) — must pass through.
    const fname = (fun as { name?: string }).name ?? "";
    if (fname.startsWith("bound ")) {
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
    if (ALLOWED_FUNCTIONS.has(fun)) {
      return fun;
    }
    const name = getFunctionName(fun);
    return function blocked() {
      throw new Error(`[plugin ${pluginId}] blocked API call: ${name}`);
    };
  };
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
