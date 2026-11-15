import {
  attrValueSetterDistortion,
  createElementDistortion,
  createElementNSDistortion,
  setAttributeDistortion,
  setAttributeNSDistortion,
  setAttributeNodeDistortion,
  setAttributeNodeNSDistortion,
  setNamedItemDistortion,
  setNamedItemNSDistortion,
} from "./distortions-dom-mutate";

function asStringArg(value: object): string {
  // type helper to pass non-string values as string in tests
  return value as unknown as string;
}

const SVG_NS = "http://www.w3.org/2000/svg";

describe("scripts-sandbox DOM-mutate distortions", () => {
  describe("createElementDistortion", () => {
    const createElement = createElementDistortion("plugin 1");

    it("blocks a blocked tag supplied as a non-string value", () => {
      const tag = { toLowerCase: () => "div", toString: () => "script" };

      expect(() => createElement.call(document, asStringArg(tag))).toThrow(
        /blocked createElement/,
      );
    });

    it("blocks a blocked tag supplied via Symbol.toPrimitive", () => {
      const tag = {
        toLowerCase: () => "div",
        [Symbol.toPrimitive]: () => "script",
      };

      expect(() => createElement.call(document, asStringArg(tag))).toThrow(
        /blocked createElement/,
      );
    });

    it("creates allowed elements", () => {
      const el = createElement.call(document, "div");
      expect(el).toBeInstanceOf(HTMLDivElement);
    });

    it("creates an allowed element supplied as a non-string value", () => {
      const tag = { toLowerCase: () => "script", toString: () => "div" };

      const el = createElement.call(document, asStringArg(tag));
      expect(el).toBeInstanceOf(HTMLDivElement);
    });

    it("blocks a blocked tag supplied as a plain string", () => {
      expect(() => createElement.call(document, "script")).toThrow(
        /blocked createElement/,
      );
    });
  });

  describe("createElementNSDistortion", () => {
    const createElementNS = createElementNSDistortion("plugin 1");

    it("blocks a blocked local name supplied as a non-string qualified name", () => {
      const qualifiedName = {
        toLowerCase: () => "svg:rect",
        toString: () => "svg:script",
      };

      expect(() =>
        createElementNS.call(document, SVG_NS, asStringArg(qualifiedName)),
      ).toThrow(/blocked createElementNS/);
    });

    it("creates allowed namespaced elements", () => {
      const el = createElementNS.call(document, SVG_NS, "svg:rect");
      expect(el.localName).toBe("rect");
    });
  });

  describe("setAttributeDistortion", () => {
    const setAttribute = setAttributeDistortion("plugin 1");

    it("blocks an inline event-handler name supplied as a non-string", () => {
      const el = document.createElement("div");
      const name = {
        toLowerCase: () => "data-value",
        toString: () => "onclick",
      };

      expect(() => setAttribute.call(el, asStringArg(name), "value")).toThrow(
        /blocked setAttribute for inline event handler/,
      );
    });

    it("blocks a javascript: URL supplied as a non-string value on a url attribute", () => {
      const el = document.createElement("a");
      const value = { toString: () => "javascript:void 0" };

      expect(() => setAttribute.call(el, "href", asStringArg(value))).toThrow(
        /blocked setAttribute with javascript: URL/,
      );
    });

    it("applies allowed attributes", () => {
      const el = document.createElement("div");
      setAttribute.call(el, "data-value", "ok");
      expect(el).toHaveAttribute("data-value", "ok");
    });
  });

  describe("setAttributeNSDistortion", () => {
    const setAttributeNS = setAttributeNSDistortion("plugin 1");

    it("blocks an inline event-handler qualified name supplied as a non-string", () => {
      const el = document.createElement("div");
      const name = {
        toLowerCase: () => "data-value",
        toString: () => "onload",
      };

      expect(() =>
        setAttributeNS.call(el, null, asStringArg(name), "value"),
      ).toThrow(/blocked setAttributeNS for inline event handler/);
    });

    it("blocks a javascript: URL supplied as a non-string value on a url attribute", () => {
      const el = document.createElement("a");
      const value = { toString: () => "javascript:void 0" };

      expect(() =>
        setAttributeNS.call(el, null, "href", asStringArg(value)),
      ).toThrow(/blocked setAttributeNS with javascript: URL/);
    });

    it("applies allowed namespaced attributes", () => {
      const el = document.createElement("div");
      setAttributeNS.call(el, null, "data-value", "ok");
      expect(el).toHaveAttribute("data-value", "ok");
    });
  });

  describe("setAttributeNodeDistortion", () => {
    const setAttributeNode = setAttributeNodeDistortion("plugin 1");

    it("blocks an attribute node with an inline event-handler name", () => {
      const el = document.createElement("div");
      const attr = document.createAttribute("onclick");
      attr.value = "value";

      expect(() => setAttributeNode.call(el, attr)).toThrow(
        /blocked setAttributeNode for inline event handler/,
      );
    });

    it("blocks an attribute node with a javascript: URL on a url attribute", () => {
      const el = document.createElement("a");
      const attr = document.createAttribute("href");
      attr.value = "javascript:void 0";

      expect(() => setAttributeNode.call(el, attr)).toThrow(
        /blocked setAttributeNode with javascript: URL/,
      );
    });

    it("applies allowed attribute nodes", () => {
      const el = document.createElement("div");
      const attr = document.createAttribute("data-value");
      attr.value = "ok";

      setAttributeNode.call(el, attr);
      expect(el).toHaveAttribute("data-value", "ok");
    });
  });

  describe("setAttributeNodeNSDistortion", () => {
    const setAttributeNodeNS = setAttributeNodeNSDistortion("plugin 1");

    it("blocks an attribute node with an inline event-handler name", () => {
      const el = document.createElement("div");
      const attr = document.createAttributeNS(null, "onload");

      expect(() => setAttributeNodeNS.call(el, attr)).toThrow(
        /blocked setAttributeNodeNS for inline event handler/,
      );
    });

    it("applies allowed attribute nodes", () => {
      const el = document.createElement("div");
      const attr = document.createAttributeNS(null, "data-value");
      attr.value = "ok";

      setAttributeNodeNS.call(el, attr);
      expect(el).toHaveAttribute("data-value", "ok");
    });
  });

  describe("setNamedItemDistortion", () => {
    const setNamedItem = setNamedItemDistortion("plugin 1");

    it("blocks an attribute node with an inline event-handler name", () => {
      const el = document.createElement("div");
      const attr = document.createAttribute("onclick");
      attr.value = "value";

      expect(() => setNamedItem.call(el.attributes, attr)).toThrow(
        /blocked setNamedItem for inline event handler/,
      );
    });

    it("blocks an attribute node with a javascript: URL on a url attribute", () => {
      const el = document.createElement("a");
      const attr = document.createAttribute("href");
      attr.value = "javascript:void 0";

      expect(() => setNamedItem.call(el.attributes, attr)).toThrow(
        /blocked setNamedItem with javascript: URL/,
      );
    });

    it("applies allowed attribute nodes", () => {
      const el = document.createElement("div");
      const attr = document.createAttribute("data-value");
      attr.value = "ok";

      setNamedItem.call(el.attributes, attr);
      expect(el).toHaveAttribute("data-value", "ok");
    });
  });

  describe("setNamedItemNSDistortion", () => {
    const setNamedItemNS = setNamedItemNSDistortion("plugin 1");

    it("blocks an attribute node with an inline event-handler name", () => {
      const el = document.createElement("div");
      const attr = document.createAttributeNS(null, "onload");

      expect(() => setNamedItemNS.call(el.attributes, attr)).toThrow(
        /blocked setNamedItemNS for inline event handler/,
      );
    });

    it("applies allowed attribute nodes", () => {
      const el = document.createElement("div");
      const attr = document.createAttributeNS(null, "data-value");
      attr.value = "ok";

      setNamedItemNS.call(el.attributes, attr);
      expect(el).toHaveAttribute("data-value", "ok");
    });
  });

  describe("attrValueSetterDistortion", () => {
    const setAttrValue = attrValueSetterDistortion("plugin 1");

    it("blocks a javascript: URL supplied as a non-string on a url-valued attribute", () => {
      const attr = document.createAttribute("href");
      const value = { toString: () => "javascript:void 0" };

      expect(() => setAttrValue.call(attr, asStringArg(value))).toThrow(
        /blocked Attr.set value with javascript: URL/,
      );
    });
  });
});
