import api from "metabase/lib/api";

import {
  getSubpathSafeUrl,
  openInNewTab,
  parseBooleanParam,
  parseEnumParam,
  parseListParam,
  parseNumberParam,
  parseStringParam,
} from "./utils";

const fakeBasename = "foobar";
const originalBasename = api.basename;

const mockWindowOpen = jest.spyOn(window, "open").mockImplementation();

describe("utils", () => {
  beforeEach(() => {
    api.basename = fakeBasename;
  });

  afterEach(() => {
    api.basename = originalBasename;
    mockWindowOpen.mockClear();
  });

  describe("getSubpathSafeUrl", () => {
    it("should return basename if url is an empty string", () => {
      expect(getSubpathSafeUrl("")).toBe(fakeBasename);
    });

    it("should return subpath-safe url", () => {
      expect(getSubpathSafeUrl("/baz")).toBe(`${fakeBasename}/baz`);
    });

    it("should return subpath-safe url if url does not have leading `/` character", () => {
      expect(getSubpathSafeUrl("baz")).toBe(`${fakeBasename}/baz`);
    });

    it("should return original url if `api.basename ` is empty", () => {
      api.basename = "";

      expect(getSubpathSafeUrl("baz")).toBe("baz");
    });
  });

  describe("openInNewTab", () => {
    it.each(["", "/", "/baz"])(
      "should open the provided link in a new tab",
      (url) => {
        openInNewTab(url);

        expect(mockWindowOpen).toHaveBeenCalledTimes(1);
        expect(mockWindowOpen).toHaveBeenCalledWith(url, "_blank");
      },
    );
  });
});

describe("parseStringParam", () => {
  it.each([
    { value: "hello", expected: "hello" },
    { value: "", expected: "" },
    { value: 123, expected: undefined },
    { value: null, expected: undefined },
    { value: undefined, expected: undefined },
  ])("should parse $value", ({ value, expected }) => {
    expect(parseStringParam(value)).toBe(expected);
  });
});

describe("parseNumberParam", () => {
  it.each<{ value: unknown; expected: number | undefined }>([
    { value: "123", expected: 123 },
    { value: "3.14", expected: 3.14 },
    { value: "abc", expected: undefined },
    { value: "", expected: undefined },
    { value: "   ", expected: undefined },
    { value: 123, expected: undefined },
  ])("should parse $value", ({ value, expected }) => {
    expect(parseNumberParam(value)).toBe(expected);
  });
});

describe("parseBooleanParam", () => {
  it.each([
    { value: "true", expected: true },
    { value: "false", expected: false },
    { value: "yes", expected: undefined },
    { value: true, expected: undefined },
    { value: null, expected: undefined },
  ])("should parse $value", ({ value, expected }) => {
    expect(parseBooleanParam(value)).toBe(expected);
  });
});

describe("parseEnumParam", () => {
  const items: readonly string[] = ["a", "b", "c"];

  it.each<{ value: unknown; expected: string | undefined }>([
    { value: "a", expected: "a" },
    { value: "b", expected: "b" },
    { value: "d", expected: undefined },
    { value: 123, expected: undefined },
  ])("should parse $value", ({ value, expected }) => {
    expect(parseEnumParam(value, items)).toBe(expected);
  });
});

describe("parseListParam", () => {
  it("should parse array of strings", () => {
    const result = parseListParam(["a", "b"], parseStringParam);
    expect(result).toEqual(["a", "b"]);
  });

  it("should wrap single value in array", () => {
    const result = parseListParam("single", parseStringParam);
    expect(result).toEqual(["single"]);
  });

  it("should filter out invalid items", () => {
    const result = parseListParam(["a", 123, "b"], parseStringParam);
    expect(result).toEqual(["a", "b"]);
  });

  it("should return undefined for null/undefined", () => {
    expect(parseListParam(null, parseStringParam)).toBeUndefined();
    expect(parseListParam(undefined, parseStringParam)).toBeUndefined();
  });
});
