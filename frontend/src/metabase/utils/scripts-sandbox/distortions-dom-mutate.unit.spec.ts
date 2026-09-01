import {
  attrValueSetterDistortion,
  createElementDistortion,
  createElementNSDistortion,
  setAttributeDistortion,
  setAttributeNSDistortion,
} from "./distortions-dom-mutate";

function asStringArg(value: object): string {
  // type helper so DOM APIs accept non-string values and coerce them to
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
