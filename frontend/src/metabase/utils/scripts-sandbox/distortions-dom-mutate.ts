import DOMPurify from "dompurify";

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
    if (BLOCKED_TAGS.has(tag.toLowerCase())) {
      throw new Error(`[${errorPrefix}] blocked createElement: ${tag}`);
    }
    return CREATE_ELEMENT.call(this, tag, options);
  };
}

export function createElementNSDistortion(errorPrefix: string) {
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
        `[${errorPrefix}] blocked createElementNS: ${qualifiedName}`,
      );
    }
    return CREATE_ELEMENT_NS.call(
      this,
      namespaceURI,
      qualifiedName,
      // Unjustified type cast. FIXME
      options as ElementCreationOptions,
    );
  };
}

function isInlineEventHandlerName(name: unknown): boolean {
  return typeof name === "string" && /^on/i.test(name);
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

function isUrlValuedAttr(name: unknown): boolean {
  return typeof name === "string" && URL_VALUED_ATTRS.has(name.toLowerCase());
}

function isJavascriptUrl(value: unknown): boolean {
  return typeof value === "string" && /^\s*javascript:/i.test(value);
}

function assertSafeAttrAssignment(
  errorPrefix: string,
  apiName: string,
  name: unknown,
  value: unknown,
): void {
  if (isInlineEventHandlerName(name)) {
    throw new Error(
      `[${errorPrefix}] blocked ${apiName} for inline event handler: ${String(name)}`,
    );
  }
  if (isUrlValuedAttr(name) && isJavascriptUrl(value)) {
    throw new Error(
      `[${errorPrefix}] blocked ${apiName} with javascript: URL: ${String(name)}`,
    );
  }
}

export function setAttributeDistortion(errorPrefix: string) {
  return function setAttribute(this: Element, name: string, value: string) {
    assertSafeAttrAssignment(errorPrefix, "setAttribute", name, value);
    return SET_ATTRIBUTE.call(this, name, value);
  };
}

export function setAttributeNSDistortion(errorPrefix: string) {
  return function setAttributeNS(
    this: Element,
    namespace: string | null,
    qualifiedName: string,
    value: string,
  ) {
    assertSafeAttrAssignment(
      errorPrefix,
      "setAttributeNS",
      qualifiedName,
      value,
    );
    return SET_ATTRIBUTE_NS.call(this, namespace, qualifiedName, value);
  };
}

export function setAttributeNodeDistortion(errorPrefix: string) {
  return function setAttributeNode(this: Element, attr: Attr) {
    assertSafeAttrAssignment(
      errorPrefix,
      "setAttributeNode",
      attr.name,
      attr.value,
    );
    return SET_ATTRIBUTE_NODE.call(this, attr);
  };
}

export function setAttributeNodeNSDistortion(errorPrefix: string) {
  return function setAttributeNodeNS(this: Element, attr: Attr) {
    assertSafeAttrAssignment(
      errorPrefix,
      "setAttributeNodeNS",
      attr.name,
      attr.value,
    );
    return SET_ATTRIBUTE_NODE_NS.call(this, attr);
  };
}

export function setNamedItemDistortion(errorPrefix: string) {
  return function setNamedItem(this: NamedNodeMap, attr: Attr) {
    assertSafeAttrAssignment(
      errorPrefix,
      "setNamedItem",
      attr.name,
      attr.value,
    );
    return SET_NAMED_ITEM.call(this, attr);
  };
}

export function setNamedItemNSDistortion(errorPrefix: string) {
  return function setNamedItemNS(this: NamedNodeMap, attr: Attr) {
    assertSafeAttrAssignment(
      errorPrefix,
      "setNamedItemNS",
      attr.name,
      attr.value,
    );
    return SET_NAMED_ITEM_NS.call(this, attr);
  };
}

export function attrValueSetterDistortion(errorPrefix: string) {
  return function (this: Attr, val: string) {
    assertSafeAttrAssignment(errorPrefix, "Attr.set value", this.name, val);
    SET_ATTR_VALUE_DESCRIPTOR?.call(this, val);
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
