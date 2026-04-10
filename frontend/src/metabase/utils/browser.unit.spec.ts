import { createMockMediaQueryList } from "__support__/ui";
import {
  isTouchDevice,
  parseHashOptions,
  stringifyHashOptions,
} from "metabase/utils/browser";

const originalMatchMedia = window.matchMedia;

function setup({
  coarsePointer = false,
  hover = false,
  maxTouchPoints = 0,
  matchMediaAvailable = true,
}: {
  coarsePointer?: boolean;
  hover?: boolean;
  maxTouchPoints?: number;
  matchMediaAvailable?: boolean;
} = {}) {
  if (matchMediaAvailable) {
    window.matchMedia = (query: string) =>
      createMockMediaQueryList({
        matches:
          (query === "(pointer: coarse)" && coarsePointer) ||
          (query === "(hover: hover)" && hover),
      });
  } else {
    (window as any).matchMedia = undefined;
  }

  Object.defineProperty(navigator, "maxTouchPoints", {
    value: maxTouchPoints,
    configurable: true,
  });
}

describe("browser", () => {
  describe("isTouchDevice", () => {
    afterEach(() => {
      window.matchMedia = originalMatchMedia;
      Object.defineProperty(navigator, "maxTouchPoints", {
        value: 0,
        configurable: true,
      });
    });

    it.each([
      {
        name: "touch-only device (coarse pointer, no hover)",
        opts: { coarsePointer: true },
        expected: true,
      },
      {
        name: "desktop (fine pointer, has hover)",
        opts: { hover: true },
        expected: false,
      },
      {
        name: "2-in-1 laptop in laptop mode (fine pointer + touch screen)",
        opts: { hover: true, maxTouchPoints: 10 },
        expected: false,
      },
      {
        name: "2-in-1 laptop in tablet mode (coarse pointer, no hover)",
        opts: { coarsePointer: true, maxTouchPoints: 10 },
        expected: true,
      },
      {
        name: "no coarse pointer and no hover",
        opts: {},
        expected: false,
      },
      {
        name: "matchMedia unavailable with touch points",
        opts: { matchMediaAvailable: false, maxTouchPoints: 5 },
        expected: true,
      },
      {
        name: "matchMedia unavailable without touch points",
        opts: { matchMediaAvailable: false },
        expected: false,
      },
    ])("returns $expected for $name", ({ opts, expected }) => {
      setup(opts);
      expect(isTouchDevice()).toBe(expected);
    });
  });

  describe("parseHashOptions", () => {
    it.each([
      { input: "#foo=bar", expected: { foo: "bar" }, name: "with '#'" },
      { input: "foo=bar", expected: { foo: "bar" }, name: "without '#'" },
      { input: "#foo=123", expected: { foo: 123 }, name: "numbers" },
      { input: "#foo=-123", expected: { foo: -123 }, name: "negative numbers" },
      { input: "#foo", expected: { foo: true }, name: "bare key as true" },
      { input: "#foo=true", expected: { foo: true }, name: "true" },
      { input: "#foo=false", expected: { foo: false }, name: "false" },
      {
        input: "#foo1=bar&foo2=123&foo3&foo4=true&foo5=false",
        expected: {
          foo1: "bar",
          foo2: 123,
          foo3: true,
          foo4: true,
          foo5: false,
        },
        name: "mixed values",
      },
    ])("should parse $name", ({ input, expected }) => {
      expect(parseHashOptions(input)).toEqual(expected);
    });
  });

  describe("stringifyHashOptions", () => {
    it.each([
      { input: { foo: "bar" }, expected: "foo=bar", name: "strings" },
      { input: { foo: 123 }, expected: "foo=123", name: "numbers" },
      { input: { foo: true }, expected: "foo", name: "true as bare key" },
      { input: { foo: false }, expected: "foo=false", name: "false" },
      {
        input: { foo1: "bar", foo2: 123, foo3: true, foo4: false },
        expected: "foo1=bar&foo2=123&foo3&foo4=false",
        name: "mixed values",
      },
    ])("should stringify $name", ({ input, expected }) => {
      expect(stringifyHashOptions(input)).toEqual(expected);
    });
  });
});
