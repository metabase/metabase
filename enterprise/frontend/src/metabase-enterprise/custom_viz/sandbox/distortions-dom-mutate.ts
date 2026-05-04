import DOMPurify from "dompurify";

import type { CustomVizPluginId } from "metabase-types/api";

export const CREATE_ELEMENT = Document.prototype.createElement;
export const CREATE_ELEMENT_NS = Document.prototype.createElementNS;
export const INSERT_ADJACENT_HTML = Element.prototype.insertAdjacentHTML;
export const SET_ATTRIBUTE = Element.prototype.setAttribute;
export const SET_ATTRIBUTE_NS = Element.prototype.setAttributeNS;

type SanitizedSetterInfo = {
  name: string;
  originalSet: (this: Element, value: string) => void;
};

export const SANITIZED_SETTERS = new Map<object, SanitizedSetterInfo>();

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
function logSanitizationIfStripped(
  pluginId: CustomVizPluginId,
  source: string,
) {
  if (DOMPurify.removed.length > 0) {
    console.error(
      `[plugin ${pluginId}] DOMPurify stripped content from ${source}:`,
      DOMPurify.removed,
    );
  }
}

export function sanitizedSetterDistortion(
  pluginId: CustomVizPluginId,
  name: string,
  originalSet: (this: Element, value: string) => void,
) {
  return function (this: Element, value: string) {
    const sanitized = DOMPurify.sanitize(value);
    logSanitizationIfStripped(pluginId, name);
    originalSet.call(this, sanitized);
  };
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

export function createElementDistortion(pluginId: CustomVizPluginId) {
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
export function createElementNSDistortion(pluginId: CustomVizPluginId) {
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

export function setAttributeDistortion(pluginId: CustomVizPluginId) {
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

export function setAttributeNSDistortion(pluginId: CustomVizPluginId) {
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

export function insertAdjacentHTMLDistortion(pluginId: CustomVizPluginId) {
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
