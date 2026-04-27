import { ALLOWED_FUNCTIONS } from "./allowlist";
import { getFunctionName } from "./debugging";

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
const CREATE_ELEMENT = Document.prototype.createElement;
const CREATE_ELEMENT_NS = Document.prototype.createElementNS;
const INSERT_ADJACENT_HTML = Element.prototype.insertAdjacentHTML;

function canvasWidthSetterDistortion(this: HTMLCanvasElement, value: number) {
  CANVAS_WIDTH_SETTER!.call(this, value);
  this.style.width = `${value / window.devicePixelRatio}px`;
}

function canvasHeightSetterDistortion(this: HTMLCanvasElement, value: number) {
  CANVAS_HEIGHT_SETTER!.call(this, value);
  this.style.height = `${value / window.devicePixelRatio}px`;
}

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
      return canvasWidthSetterDistortion;
    }
    if (v === CANVAS_HEIGHT_SETTER) {
      return canvasHeightSetterDistortion;
    }
    if (SANITIZED_SETTERS.has(v)) {
      return SANITIZED_SETTERS.get(v) as object;
    }
    if (v === CREATE_ELEMENT) {
      return function createElement(
        this: Document,
        tag: string,
        options?: ElementCreationOptions,
      ) {
        if (BLOCKED_TAGS.has(tag.toLowerCase())) {
          throw new Error(`[plugin ${pluginId}] blocked createElement: ${tag}`);
        }
        return CREATE_ELEMENT.call(
          this,
          tag,
          options as ElementCreationOptions,
        );
      };
    }
    if (v === CREATE_ELEMENT_NS) {
      return function createElementNS(
        this: Document,
        ns: string | null,
        qualifiedName: string,
        options?: ElementCreationOptions | string,
      ) {
        const localName = (
          qualifiedName.split(":").pop() ?? qualifiedName
        ).toLowerCase();
        if (localName === "script") {
          throw new Error(
            `[plugin ${pluginId}] blocked createElementNS: ${qualifiedName}`,
          );
        }
        return CREATE_ELEMENT_NS.call(
          this,
          ns,
          qualifiedName,
          options as ElementCreationOptions,
        );
      };
    }

    if (v === INSERT_ADJACENT_HTML) {
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
    if (ALLOWED_FUNCTIONS.has(v)) {
      return v;
    }
    const name = getFunctionName(v);
    return function blocked() {
      throw new Error(`[plugin ${pluginId}] blocked API call: ${name}`);
    };
  };
}
