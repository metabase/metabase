import DOMPurify from "dompurify";

import {
  ACTIVE_ELEMENT_GETTER,
  CREATE_ELEMENT,
  CREATE_ELEMENT_NS,
  INSERT_ADJACENT_HTML,
  SET_ATTRIBUTE,
  SET_ATTRIBUTE_NS,
} from "./allowlist";
import { getFunctionName } from "./debugging";
import { getSafeSandboxDomElement, isDomElement } from "./distortions-dom";

// Flip to true to log a console.warn for every native function the sandbox
// rejects, including its source preview and identity comparisons. Useful when
// a plugin hits "blocked API call: …" and we need to figure out which
// captured reference the runtime function should match against. Keep false
// in checked-in code.
const DIAGNOSE_BLOCKED_CALLS = false;

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

    if (value === ACTIVE_ELEMENT_GETTER) {
      return activeElementDistortion(pluginId);
    }

    if (value === CREATE_ELEMENT) {
      return createElementDistortion(pluginId);
    }

    if (value === CREATE_ELEMENT_NS) {
      return createElementNSDistortion(pluginId);
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

    // Default-allow native functions, with a name-based blocklist for the
    // few APIs that must never be reachable from the sandbox. Identity-based
    // allowlisting is unreliable: near-membrane wraps host functions when
    // crossing into the sandbox iframe, so the runtime reference often
    // differs from what we capture in host realm. Name matching is
    // realm-agnostic. The targeted distortions above (innerHTML, setAttribute,
    // createElement, etc.) still work because near-membrane preserves
    // identity for those well-known intrinsics — the hot path stays gated.
    const name = getFunctionName(value);
    if (BLOCKED_NATIVE_NAMES.has(name)) {
      return function blocked() {
        throw new Error(`[plugin ${pluginId}] blocked API call: ${name}`);
      };
    }

    if (DIAGNOSE_BLOCKED_CALLS) {
      // Now logs PASS-THROUGH events instead — useful when chasing why a
      // dangerous-looking call isn't blocked. Off by default.
      try {
        const src = Function.prototype.toString.call(value);
        console.warn(
          `[plugin ${pluginId}] PASS ${name} | src=${src.slice(0, 80)}`,
        );
      } catch {
        // ignore
      }
    }

    return value;
  };
}

// Native APIs that must never be invoked from a sandboxed plugin. Matched
// by `getFunctionName` output, which returns either a friendly name from
// FUNCTION_NAMES (e.g. "Document.write") for host-realm refs, or the bare
// .name property (e.g. "write") for cross-realm refs that don't match the
// host weakmap. Both forms are listed here so blocking works regardless of
// whether near-membrane preserved identity.
//
// Only blocks NATIVE functions (the isUserDefinedFunction check above lets
// user code freely define functions of the same name). The bare-name match
// is broad on purpose: every native function that ends up named "fetch",
// "open", "write" in any realm is dangerous in this context.
const BLOCKED_NATIVE_NAMES = new Set([
  // ---- Bare names (cross-realm or unrecognized refs) ----

  // Network exfiltration
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "sendBeacon",

  // Document destruction / navigation
  "write",
  "writeln",
  "open", // window.open, document.open, XMLHttpRequest.open
  "close", // window.close, document.close
  "execCommand",
  "navigate",

  // Cookie / session / domain
  "get cookie",
  "set cookie",
  "set domain",

  // Storage exfiltration
  "get localStorage",
  "get sessionStorage",
  "get indexedDB",
  "get caches",

  // Hardware / device APIs
  "get clipboard",
  "get geolocation",
  "get mediaDevices",
  "get serviceWorker",
  "get credentials",
  "get permissions",
  "get usb",
  "get bluetooth",
  "get share",
  "share",
  "get hid",
  "get serial",
  "get xr",
  "get wakeLock",
  "get locks",
  "get storage",
  "get presentation",

  // Location / History — sandbox shouldn't navigate or rewrite the host
  "assign", // location.assign
  "reload",
  "pushState",
  "replaceState",
  "go", // history.go
  "back",
  "forward",
  "set href", // location.href setter

  // ---- Friendly names from FUNCTION_NAMES (host-realm matches) ----

  "window.fetch",
  "window.XMLHttpRequest",
  "window.WebSocket",
  "window.EventSource",
  "window.open",
  "window.close",
  "Window.open",
  "Window.close",
  "Document.write",
  "Document.writeln",
  "Document.open",
  "Document.close",
  "Document.execCommand",
  "Document.get cookie",
  "Document.set cookie",
  "Document.set domain",
  "Navigator.sendBeacon",
  "Navigator.share",
  "Navigator.get clipboard",
  "Navigator.get geolocation",
  "Navigator.get mediaDevices",
  "Navigator.get serviceWorker",
  "Navigator.get credentials",
  "Navigator.get permissions",
  "Navigator.get usb",
  "Navigator.get bluetooth",
  "Navigator.get share",
  "Navigator.get presentation",
  "Navigator.get hid",
  "Navigator.get serial",
  "Navigator.get xr",
  "Navigator.get wakeLock",
  "Navigator.get locks",
  "Navigator.get storage",
  "Window.get localStorage",
  "Window.get sessionStorage",
  "Window.get indexedDB",
  "Window.get caches",
]);

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

// document.activeElement crosses the membrane and would otherwise be replaced
// with a decoy when focus is on host UI — noisy and confusing for libraries
// (notably React) that probe activeElement during rendering. Return null when
// the focused element is outside the plugin's subtree, so the plugin sees
// "nothing focused inside my React tree" rather than a fake element.
function activeElementDistortion(pluginId: string) {
  return function activeElement(this: Document): Element | null {
    const el = ACTIVE_ELEMENT_GETTER!.call(this) as Element | null;
    if (!el) {
      return null;
    }
    const inSandbox = el.closest(`[data-plugin-sandbox="${pluginId}"]`);
    return inSandbox ? el : null;
  };
}

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

// Same blocklist applied to namespaced creates (SVG/MathML). React reaches
// for createElementNS to build SVG trees — common for visualization plugins —
// but the dangerous-tag filter (script, iframe, etc.) still applies.
function createElementNSDistortion(pluginId: string) {
  return function createElementNS(
    this: Document,
    namespaceURI: string | null,
    qualifiedName: string,
    options?: ElementCreationOptions,
  ) {
    const localName = qualifiedName.includes(":")
      ? qualifiedName.slice(qualifiedName.indexOf(":") + 1)
      : qualifiedName;
    if (BLOCKED_TAGS.has(localName.toLowerCase())) {
      throw new Error(
        `[plugin ${pluginId}] blocked createElementNS: ${qualifiedName}`,
      );
    }
    return CREATE_ELEMENT_NS.call(
      this,
      namespaceURI,
      qualifiedName,
      options as ElementCreationOptions,
    );
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
