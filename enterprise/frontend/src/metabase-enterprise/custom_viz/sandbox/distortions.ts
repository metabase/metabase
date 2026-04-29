import DOMPurify from "dompurify";

import {
  ALLOWED_FUNCTIONS,
  CREATE_ELEMENT,
  INSERT_ADJACENT_HTML,
  SET_ATTRIBUTE,
  SET_ATTRIBUTE_NS,
} from "./allowlist";
import { getFunctionName } from "./debugging";
import { getSafeSandboxDomElement, isDomElement } from "./distortions-dom";

export function makeDistortionCallback(pluginId: string) {
  return function distortionCallback(value: object): object {
    if (isDomElement(value)) {
      return getSafeSandboxDomElement(value, pluginId);
    }

    if (typeof value !== "function") {
      return value;
    }

    if (isUserDefinedFunction(value)) {
      return value;
    }

    if (value === CANVAS_WIDTH_SETTER) {
      return canvasWidthSetterDistortion;
    }

    if (value === CANVAS_HEIGHT_SETTER) {
      return canvasHeightSetterDistortion;
    }

    if (SANITIZED_SETTERS.has(value)) {
      const info = SANITIZED_SETTERS.get(value)!;
      return sanitizedSetterDistortion(pluginId, info.name, info.originalSet);
    }

    if (value === CREATE_ELEMENT) {
      return createElementDistortion(pluginId);
    }

    if (value === INSERT_ADJACENT_HTML) {
      return insertAdjacentHTMLDistortion(pluginId);
    }

    if (value === SET_ATTRIBUTE) {
      return setAttributeDistortion(pluginId);
    }

    if (value === SET_ATTRIBUTE_NS) {
      return setAttributeNSDistortion(pluginId);
    }

    if (ALLOWED_FUNCTIONS.has(value)) {
      return value;
    }

    const name = getFunctionName(value);
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
//
// Distortion callback returns a `blocked` function on first
// access, and `blocked.bind(...)` is still a function that throws when called.
function isUserDefinedFunction(fun: object): boolean {
  if (!Function.prototype.toString.call(fun).includes("[native code]")) {
    return true;
  }
  const fname = Object.getOwnPropertyDescriptor(fun, "name")?.value;
  return fname.startsWith("bound ");
}

// Wraps innerHTML/outerHTML through DOMPurify before they reach the DOM.
type SanitizedSetterInfo = {
  name: string;
  originalSet: (this: Element, value: string) => void;
};

const SANITIZED_SETTERS = new Map<object, SanitizedSetterInfo>();

for (const key of ["innerHTML", "outerHTML"] as const) {
  const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, key);
  if (descriptor?.set) {
    SANITIZED_SETTERS.set(descriptor.set, {
      name: key,
      originalSet: descriptor.set,
    });
  }
}

// DOMPurify exposes the list of nodes/attributes it stripped from the most
// recent sanitize call as `DOMPurify.removed`. Reading it immediately after
// sanitize lets us log only when something dangerous was actually removed,
// not on harmless normalization (case, whitespace, missing close tags). The
// distortion runs in the host realm, so console output goes to the host.
function logSanitizationIfStripped(pluginId: string, source: string) {
  if (DOMPurify.removed.length > 0) {
    console.error(
      `[plugin ${pluginId}] DOMPurify stripped content from ${source}:`,
      DOMPurify.removed,
    );
  }
}

function sanitizedSetterDistortion(
  pluginId: string,
  name: string,
  originalSet: (this: Element, value: string) => void,
) {
  return function (this: Element, value: string) {
    const sanitized = DOMPurify.sanitize(value);
    logSanitizationIfStripped(pluginId, name);
    originalSet.call(this, sanitized);
  };
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

// URL-valued attributes — setting `javascript:<code>` here makes the browser
// run <code> in the host realm (outside the membrane) when the element is
// followed/submitted/loaded.
const URL_VALUED_ATTRS = new Set([
  "href",
  "src",
  "xlink:href",
  "action",
  "formaction",
  "poster",
  "cite",
  "background",
  "manifest",
]);

function isUrlValuedAttr(name: unknown): boolean {
  return typeof name === "string" && URL_VALUED_ATTRS.has(name.toLowerCase());
}

// Browsers tolerate leading whitespace before the protocol (e.g.
// " javascript:..." still navigates), so allow any leading whitespace
// before testing the prefix.
function isJavascriptUrl(value: unknown): boolean {
  return typeof value === "string" && /^\s*javascript:/i.test(value);
}

function setAttributeDistortion(pluginId: string) {
  return function setAttribute(this: Element, name: string, value: string) {
    if (isInlineEventHandlerName(name)) {
      throw new Error(
        `[plugin ${pluginId}] blocked setAttribute for inline event handler: ${name}`,
      );
    }
    if (isUrlValuedAttr(name) && isJavascriptUrl(value)) {
      throw new Error(
        `[plugin ${pluginId}] blocked setAttribute with javascript: URL: ${name}`,
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
    if (isUrlValuedAttr(qualifiedName) && isJavascriptUrl(value)) {
      throw new Error(
        `[plugin ${pluginId}] blocked setAttributeNS with javascript: URL: ${qualifiedName}`,
      );
    }
    return SET_ATTRIBUTE_NS.call(this, namespace, qualifiedName, value);
  };
}

function insertAdjacentHTMLDistortion(pluginId: string) {
  return function insertAdjacentHTML(
    this: Element,
    position: InsertPosition,
    html: string,
  ) {
    const sanitized = DOMPurify.sanitize(html);
    logSanitizationIfStripped(pluginId, "insertAdjacentHTML");
    INSERT_ADJACENT_HTML.call(this, position, sanitized);
  };
}
