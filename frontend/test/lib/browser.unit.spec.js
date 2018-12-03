import { parseHashOptions, stringifyHashOptions } from "metabase/lib/browser";

describe("browser", () => {
  describe("parseHashOptions", () => {
    it("should parse with prepended '#'", () => {
      expect(parseHashOptions("#foo=bar")).toEqual({ foo: "bar" });
    });
    it("should parse without prepended '#'", () => {
      expect(parseHashOptions("foo=bar")).toEqual({ foo: "bar" });
    });
    it("should parse strings", () => {
      expect(parseHashOptions("#foo=bar")).toEqual({ foo: "bar" });
    });
    it("should parse numbers", () => {
      expect(parseHashOptions("#foo=123")).toEqual({ foo: 123 });
    });
    it("should parse negative numbers", () => {
      expect(parseHashOptions("#foo=-123")).toEqual({ foo: -123 });
    });
    it("should parse base key as true", () => {
      expect(parseHashOptions("#foo")).toEqual({ foo: true });
    });
    it("should parse true", () => {
      expect(parseHashOptions("#foo=true")).toEqual({ foo: true });
    });
    it("should parse false", () => {
      expect(parseHashOptions("#foo=false")).toEqual({ foo: false });
    });
    it("should parse all the things", () => {
      expect(
        parseHashOptions("#foo1=bar&foo2=123&foo3&foo4=true&foo5=false"),
      ).toEqual({
        foo1: "bar",
        foo2: 123,
        foo3: true,
        foo4: true,
        foo5: false,
      });
    });
  });
  describe("stringifyHashOptions", () => {
    it("should stringify strings", () => {
      expect(stringifyHashOptions({ foo: "bar" })).toEqual("foo=bar");
    });
    it("should stringify numbers", () => {
      expect(stringifyHashOptions({ foo: 123 })).toEqual("foo=123");
    });
    it("should stringify base key as true", () => {
      expect(stringifyHashOptions({ foo: true })).toEqual("foo");
    });
    it("should stringify false", () => {
      expect(stringifyHashOptions({ foo: false })).toEqual("foo=false");
    });
    it("should stringify all the things", () => {
      expect(
        stringifyHashOptions({
          foo1: "bar",
          foo2: 123,
          foo3: true,
          foo4: false,
        }),
      ).toEqual("foo1=bar&foo2=123&foo3&foo4=false");
    });
  });
});
