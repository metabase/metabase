import DOMPurify from "dompurify";

import type { CustomVizPluginId } from "metabase-types/api";

export const CREATE_ELEMENT = Document.prototype.createElement;
export const CREATE_ELEMENT_NS = Document.prototype.createElementNS;
export const INSERT_ADJACENT_HTML = Element.prototype.insertAdjacentHTML;
export const SET_ATTRIBUTE = Element.prototype.setAttribute;
export const SET_ATTRIBUTE_NS = Element.prototype.setAttributeNS;
export const SET_ATTRIBUTE_NODE = Element.prototype.setAttributeNode;
export const SET_ATTRIBUTE_NODE_NS = Element.prototype.setAttributeNodeNS;
export const SET_NAMED_ITEM = NamedNodeMap.prototype.setNamedItem;
export const SET_NAMED_ITEM_NS = NamedNodeMap.prototype.setNamedItemNS;

export const SET_ATTR_VALUE_DESCRIPTOR = Object.getOwnPropertyDescriptor(
  Attr.prototype,
  "value",
)?.set;

type SanitizedSetterInfo = {
  name: string;
  originalSet: (this: Element | ShadowRoot, value: string) => void;
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

const shadowInnerHTMLDescriptor = Object.getOwnPropertyDescriptor(
  ShadowRoot.prototype,
  "innerHTML",
);
if (shadowInnerHTMLDescriptor?.set) {
  SANITIZED_SETTERS.set(shadowInnerHTMLDescriptor.set, {
    name: "ShadowRoot.innerHTML",
    originalSet: shadowInnerHTMLDescriptor.set,
  });
}

const PURIFY_CONFIG = {
  // `<area>` is a hidden anchor (href/target/download), and `<map>` only
  // exists to host `<area>` — both same threat class as `<a>`.
  FORBID_TAGS: ["form", "a", "style", "frame", "map", "area"],
  FORBID_ATTR: ["target", "formaction", "action"],
  ALLOWED_URI_REGEXP:
    /^(?:#|\/|https?:|data:image\/(?:png|jpeg|gif|svg\+xml|webp);)/i,
};

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
  originalSet: (this: Element | ShadowRoot, value: string) => void,
) {
  return function (this: Element | ShadowRoot, value: string) {
    const sanitized = DOMPurify.sanitize(value, PURIFY_CONFIG);
    logSanitizationIfStripped(pluginId, name);
    originalSet.call(this, sanitized);
  };
}

// Tags that must never be created — they can load or execute arbitrary
// code, or are tags we don't want plugins rendering at all.
const BLOCKED_TAGS = new Set([
  "script",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "base",
  "frame",
  "form",
  "a",
  // `<area>` is a hidden anchor (href/target/download navigation) and
  // `<map>` only exists as its container — same threat class as `<a>`.
  "map",
  "area",
  // CSS-based exfiltration (`@font-face { src: url(...) }`,
  // `background-image: url(...)`) until CSP font-src/img-src is tightened
  // (GDGT-2373). DOMPurify already strips `<style>` from sanitized HTML, but
  // the createElement path skips DOMPurify entirely.
  "style",
  // Media elements load URLs via `src`/`srcset`
  "video",
  "audio",
  "source",
  "track",
  // `<input type="image">` fires a GET to `src` on render. `<input type=image src="…">` is a vector for exfiltration.
  "input",
  // SVG external-resource / mutation-XSS vectors
  "use",
  "image",
  "feimage",
  "foreignobject",
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
    return CREATE_ELEMENT.call(this, tag, options);
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

function assertSafeAttrAssignment(
  pluginId: CustomVizPluginId,
  apiName: string,
  name: unknown,
  value: unknown,
): void {
  if (isInlineEventHandlerName(name)) {
    throw new Error(
      `[plugin ${pluginId}] blocked ${apiName} for inline event handler: ${String(name)}`,
    );
  }
  if (isUrlValuedAttr(name) && isJavascriptUrl(value)) {
    throw new Error(
      `[plugin ${pluginId}] blocked ${apiName} with javascript: URL: ${String(name)}`,
    );
  }
}

export function setAttributeDistortion(pluginId: CustomVizPluginId) {
  return function setAttribute(this: Element, name: string, value: string) {
    assertSafeAttrAssignment(pluginId, "setAttribute", name, value);
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
    assertSafeAttrAssignment(pluginId, "setAttributeNS", qualifiedName, value);
    return SET_ATTRIBUTE_NS.call(this, namespace, qualifiedName, value);
  };
}

export function setAttributeNodeDistortion(pluginId: CustomVizPluginId) {
  return function setAttributeNode(this: Element, attr: Attr) {
    assertSafeAttrAssignment(
      pluginId,
      "setAttributeNode",
      attr.name,
      attr.value,
    );
    return SET_ATTRIBUTE_NODE.call(this, attr);
  };
}

export function setAttributeNodeNSDistortion(pluginId: CustomVizPluginId) {
  return function setAttributeNodeNS(this: Element, attr: Attr) {
    assertSafeAttrAssignment(
      pluginId,
      "setAttributeNodeNS",
      attr.name,
      attr.value,
    );
    return SET_ATTRIBUTE_NODE_NS.call(this, attr);
  };
}

export function setNamedItemDistortion(pluginId: CustomVizPluginId) {
  return function setNamedItem(this: NamedNodeMap, attr: Attr) {
    assertSafeAttrAssignment(pluginId, "setNamedItem", attr.name, attr.value);
    return SET_NAMED_ITEM.call(this, attr);
  };
}

export function setNamedItemNSDistortion(pluginId: CustomVizPluginId) {
  return function setNamedItemNS(this: NamedNodeMap, attr: Attr) {
    assertSafeAttrAssignment(pluginId, "setNamedItemNS", attr.name, attr.value);
    return SET_NAMED_ITEM_NS.call(this, attr);
  };
}

export function attrValueSetterDistortion(pluginId: CustomVizPluginId) {
  return function (this: Attr, val: string) {
    assertSafeAttrAssignment(pluginId, "Attr.set value", this.name, val);
    SET_ATTR_VALUE_DESCRIPTOR?.call(this, val);
  };
}

export function insertAdjacentHTMLDistortion(pluginId: CustomVizPluginId) {
  return function insertAdjacentHTML(
    this: Element,
    position: InsertPosition,
    html: string,
  ) {
    const sanitized = DOMPurify.sanitize(html, PURIFY_CONFIG);
    logSanitizationIfStripped(pluginId, "insertAdjacentHTML");
    INSERT_ADJACENT_HTML.call(this, position, sanitized);
  };
}
