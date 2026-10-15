import DOMPurify from "dompurify";

import { coerceToString } from "./coerce";

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
  FORBID_TAGS: ["form", "a", "style", "frame", "map", "area"],
  FORBID_ATTR: ["target", "formaction", "action"],
  ALLOWED_URI_REGEXP:
    /^(?:#|\/|https?:|data:image\/(?:png|jpeg|gif|svg\+xml|webp);)/i,
};

function logSanitizationIfStripped(errorPrefix: string, source: string) {
  if (DOMPurify.removed.length > 0) {
    console.error(
      `[${errorPrefix}] DOMPurify stripped content from ${source}:`,
      DOMPurify.removed,
    );
  }
}

export function sanitizedSetterDistortion(
  errorPrefix: string,
  name: string,
  originalSet: (this: Element | ShadowRoot, value: string) => void,
) {
  return function (this: Element | ShadowRoot, value: string) {
    const sanitized = DOMPurify.sanitize(value, PURIFY_CONFIG);
    logSanitizationIfStripped(errorPrefix, name);
    originalSet.call(this, sanitized);
  };
}

export const BLOCKED_TAGS = new Set([
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
  "map",
  "area",
  "style",
  "video",
  "audio",
  "source",
  "track",
  "input",
  "use",
  "image",
  "feimage",
  "foreignobject",
]);

export function createElementDistortion(errorPrefix: string) {
  return function createElement(
    this: Document,
    tag: string,
    options?: ElementCreationOptions,
  ) {
    const tagName = coerceToString(tag);
    if (BLOCKED_TAGS.has(tagName.toLowerCase())) {
      throw new Error(`[${errorPrefix}] blocked createElement: ${tagName}`);
    }
    return CREATE_ELEMENT.call(this, tagName, options);
  };
}

/**
 * Strip an XML namespace prefix from a qualified name (`svg:rect` -> `rect`).
 * `indexOf` is -1 when there's no prefix, so `slice` returns the whole name.
 */
export function getXmlElementLocalName(qualifiedName: string): string {
  return qualifiedName.slice(qualifiedName.indexOf(":") + 1);
}

export function createElementNSDistortion(errorPrefix: string) {
  return function createElementNS(
    this: Document,
    namespaceURI: string | null,
    qualifiedName: string,
    options?: ElementCreationOptions,
  ) {
    const name = coerceToString(qualifiedName);
    if (BLOCKED_TAGS.has(getXmlElementLocalName(name).toLowerCase())) {
      throw new Error(`[${errorPrefix}] blocked createElementNS: ${name}`);
    }
    return CREATE_ELEMENT_NS.call(this, namespaceURI, name, options);
  };
}

function isInlineEventHandlerName(name: string): boolean {
  return /^on/i.test(name);
}

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

function isUrlValuedAttr(name: string): boolean {
  return URL_VALUED_ATTRS.has(name.toLowerCase());
}

function isJavascriptUrl(value: string): boolean {
  return /^\s*javascript:/i.test(value);
}

function assertSafeAttrAssignment(
  errorPrefix: string,
  apiName: string,
  name: string,
  value: string,
): void {
  if (isInlineEventHandlerName(name)) {
    throw new Error(
      `[${errorPrefix}] blocked ${apiName} for inline event handler: ${name}`,
    );
  }
  if (isUrlValuedAttr(name) && isJavascriptUrl(value)) {
    throw new Error(
      `[${errorPrefix}] blocked ${apiName} with javascript: URL: ${name}`,
    );
  }
}

export function setAttributeDistortion(errorPrefix: string) {
  return function setAttribute(this: Element, name: string, value: string) {
    const attrName = coerceToString(name);
    const attrValue = coerceToString(value);
    assertSafeAttrAssignment(errorPrefix, "setAttribute", attrName, attrValue);
    return SET_ATTRIBUTE.call(this, attrName, attrValue);
  };
}

export function setAttributeNSDistortion(errorPrefix: string) {
  return function setAttributeNS(
    this: Element,
    namespace: string | null,
    qualifiedName: string,
    value: string,
  ) {
    const attrName = coerceToString(qualifiedName);
    const attrValue = coerceToString(value);
    assertSafeAttrAssignment(
      errorPrefix,
      "setAttributeNS",
      attrName,
      attrValue,
    );
    return SET_ATTRIBUTE_NS.call(this, namespace, attrName, attrValue);
  };
}

export function setAttributeNodeDistortion(errorPrefix: string) {
  return function setAttributeNode(this: Element, attr: Attr) {
    assertSafeAttrAssignment(
      errorPrefix,
      "setAttributeNode",
      coerceToString(attr.name),
      coerceToString(attr.value),
    );
    return SET_ATTRIBUTE_NODE.call(this, attr);
  };
}

export function setAttributeNodeNSDistortion(errorPrefix: string) {
  return function setAttributeNodeNS(this: Element, attr: Attr) {
    assertSafeAttrAssignment(
      errorPrefix,
      "setAttributeNodeNS",
      coerceToString(attr.name),
      coerceToString(attr.value),
    );
    return SET_ATTRIBUTE_NODE_NS.call(this, attr);
  };
}

export function setNamedItemDistortion(errorPrefix: string) {
  return function setNamedItem(this: NamedNodeMap, attr: Attr) {
    assertSafeAttrAssignment(
      errorPrefix,
      "setNamedItem",
      coerceToString(attr.name),
      coerceToString(attr.value),
    );
    return SET_NAMED_ITEM.call(this, attr);
  };
}

export function setNamedItemNSDistortion(errorPrefix: string) {
  return function setNamedItemNS(this: NamedNodeMap, attr: Attr) {
    assertSafeAttrAssignment(
      errorPrefix,
      "setNamedItemNS",
      coerceToString(attr.name),
      coerceToString(attr.value),
    );
    return SET_NAMED_ITEM_NS.call(this, attr);
  };
}

export function attrValueSetterDistortion(errorPrefix: string) {
  return function (this: Attr, val: string) {
    const value = coerceToString(val);
    assertSafeAttrAssignment(
      errorPrefix,
      "Attr.set value",
      coerceToString(this.name),
      value,
    );
    SET_ATTR_VALUE_DESCRIPTOR?.call(this, value);
  };
}

export function insertAdjacentHTMLDistortion(errorPrefix: string) {
  return function insertAdjacentHTML(
    this: Element,
    position: InsertPosition,
    html: string,
  ) {
    const sanitized = DOMPurify.sanitize(html, PURIFY_CONFIG);
    logSanitizationIfStripped(errorPrefix, "insertAdjacentHTML");
    INSERT_ADJACENT_HTML.call(this, position, sanitized);
  };
}
