import {
  isTouchDevice,
  parseHashOptions,
  stringifyHashOptions,
} from "metabase/utils/browser";

describe("browser", () => {
  describe("isTouchDevice", () => {
    const originalMatchMedia = window.matchMedia;

    function mockMatchMedia(
      results: Record<string, boolean>,
    ): typeof window.matchMedia {
      return (query: string) =>
        ({
          matches: results[query] ?? false,
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        }) as MediaQueryList;
    }

    afterEach(() => {
      window.matchMedia = originalMatchMedia;
      Object.defineProperty(navigator, "maxTouchPoints", {
        value: 0,
        configurable: true,
      });
    });

    it("returns true for touch-only devices (coarse pointer, no hover)", () => {
      window.matchMedia = mockMatchMedia({
        "(pointer: coarse)": true,
        "(hover: hover)": false,
      });

      expect(isTouchDevice()).toBe(true);
    });

    it("returns false for desktop (fine pointer, has hover)", () => {
      window.matchMedia = mockMatchMedia({
        "(pointer: coarse)": false,
        "(hover: hover)": true,
      });

      expect(isTouchDevice()).toBe(false);
    });

    it("returns false for 2-in-1 laptops in laptop mode (fine pointer + touch screen)", () => {
      window.matchMedia = mockMatchMedia({
        "(pointer: coarse)": false,
        "(hover: hover)": true,
      });
      Object.defineProperty(navigator, "maxTouchPoints", {
        value: 10,
        configurable: true,
      });

      expect(isTouchDevice()).toBe(false);
    });

    it("returns true for 2-in-1 laptops in tablet mode (coarse pointer, no hover)", () => {
      window.matchMedia = mockMatchMedia({
        "(pointer: coarse)": true,
        "(hover: hover)": false,
      });
      Object.defineProperty(navigator, "maxTouchPoints", {
        value: 10,
        configurable: true,
      });

      expect(isTouchDevice()).toBe(true);
    });

    it("returns false when only hover is missing but pointer is fine", () => {
      window.matchMedia = mockMatchMedia({
        "(pointer: coarse)": false,
        "(hover: hover)": false,
      });

      expect(isTouchDevice()).toBe(false);
    });

    it("falls back to maxTouchPoints when matchMedia is not available", () => {
      (window as any).matchMedia = undefined;
      Object.defineProperty(navigator, "maxTouchPoints", {
        value: 5,
        configurable: true,
      });

      expect(isTouchDevice()).toBe(true);
    });

    it("returns false when matchMedia unavailable and no touch points", () => {
      (window as any).matchMedia = undefined;
      Object.defineProperty(navigator, "maxTouchPoints", {
        value: 0,
        configurable: true,
      });

      expect(isTouchDevice()).toBe(false);
    });
  });

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
