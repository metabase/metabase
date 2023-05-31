import { ALL_OPERATOR_NAMES } from "metabase/visualizations/components/settings/ChartSettingsTableFormatting";
import {
  canCompareSubstrings,
  OPERATOR_FORMATTER_FACTORIES,
  compileFormatter,
  extent,
} from "metabase/visualizations/lib/table_format";

describe("compileFormatter", () => {
  it("should return a function, even for unsupported operators", () => {
    const formatter = compileFormatter({
      type: "single",
      operator: "this-non-existant-operator-is-used-for-testing",
    });

    expect(formatter).toBeDefined();
  });

  it("should support all defined operators", () => {
    // This test is to remind anyone adding/removing operator support, that the
    // same should be done to `OPERATOR_FORMATTER_FACTORIES`.
    const supportedOperators = Object.keys(OPERATOR_FORMATTER_FACTORIES).sort();
    const definedOperators = Object.keys(ALL_OPERATOR_NAMES).sort();

    expect(supportedOperators).toEqual(definedOperators);
  });

  it("properly ignores empty string searches for all text formatters", () => {
    const textFormatters = [
      "!=",
      "contains",
      "does-not-contain",
      "starts-with",
      "ends-with",
    ];

    textFormatters.forEach(factoryName => {
      const factory = OPERATOR_FORMATTER_FACTORIES[factoryName]("", "#fff");
      expect(factory("foo")).toBeNull();
      expect(factory("")).toBeNull();
      expect(factory(0)).toBeNull();
    });
  });

  it("properly detects not equal text", () => {
    const formatter = OPERATOR_FORMATTER_FACTORIES["!="]("foo", "#fff");

    expect(formatter("")).toBe("#fff");
    expect(formatter("bar")).toBe("#fff");
    expect(formatter(0)).toBe("#fff");

    expect(formatter("foo")).toBe(null);
  });

  it("properly detects not equal numbers", () => {
    const formatter = OPERATOR_FORMATTER_FACTORIES["!="](17, "#fff");

    expect(formatter("foo")).toBe("#fff");
    expect(formatter(0)).toBe("#fff");
    expect(formatter(16)).toBe("#fff");

    expect(formatter(17)).toBe(null);
  });

  it("properly detects contains text", () => {
    const formatter = OPERATOR_FORMATTER_FACTORIES.contains("foo", "#fff");

    expect(formatter("fooBar")).toBe("#fff");
    expect(formatter("Barfoo")).toBe("#fff");
    expect(formatter("bARfooBaz")).toBe("#fff");

    expect(formatter("")).toBe(null);
    expect(formatter("Foo")).toBe(null);
    expect(formatter("Foobar")).toBe(null);
    expect(formatter("not")).toBe(null);
  });

  it("properly detects does-not-contain text", () => {
    const formatter = OPERATOR_FORMATTER_FACTORIES["does-not-contain"](
      "foo",
      "#fff",
    );

    expect(formatter("Foo")).toBe("#fff");
    expect(formatter("Foobar")).toBe("#fff");
    expect(formatter("not")).toBe("#fff");

    expect(formatter("")).toBe(null);
    expect(formatter("fooBar")).toBe(null);
    expect(formatter("Barfoo")).toBe(null);
    expect(formatter("bARfooBaz")).toBe(null);
  });

  it("properly detects starts with text", () => {
    const formatter = OPERATOR_FORMATTER_FACTORIES["starts-with"](
      "foo",
      "#fff",
    );

    expect(formatter("fooBar")).toBe("#fff");
    expect(formatter("foo")).toBe("#fff");
    expect(formatter("fool")).toBe("#fff");

    expect(formatter("")).toBe(null);
    expect(formatter("Foo")).toBe(null);
    expect(formatter("Barfoo")).toBe(null);
    expect(formatter("bARfooBaz")).toBe(null);
  });

  it("properly detects ends with text", () => {
    const formatter = OPERATOR_FORMATTER_FACTORIES["ends-with"]("foo", "#fff");

    expect(formatter("Barfoo")).toBe("#fff");
    expect(formatter("foo")).toBe("#fff");
    expect(formatter("baz.foo")).toBe("#fff");

    expect(formatter("")).toBe(null);
    expect(formatter("fooBar")).toBe(null);
    expect(formatter("food")).toBe(null);
    expect(formatter("foo ")).toBe(null);
  });
});

describe("canCompareSubstrings", () => {
  it("should return true for strings", () => {
    expect(canCompareSubstrings("foo", "bar")).toBe(true);
  });

  it("should return false for any non-strings", () => {
    expect(canCompareSubstrings(1, 2)).toBe(false);
    expect(canCompareSubstrings(1, "foo")).toBe(false);
    expect(canCompareSubstrings(null, "foo")).toBe(false);
    expect(canCompareSubstrings("foo", undefined)).toBe(false);
    expect(canCompareSubstrings("foo", [])).toBe(false);
  });

  it("should return false for any empty strings", () => {
    expect(canCompareSubstrings("", "foo")).toBe(false);
    expect(canCompareSubstrings("foo", "")).toBe(false);
    expect(canCompareSubstrings("", "")).toBe(false);
  });
});

describe("extent", () => {
  it("should correctly compute the extents for each column", () => {
    const rows = [
      [-12, 4, 8],
      [0, -3, 2],
      [-1, 0, 17],
    ];

    expect(extent(rows, 0)).toEqual([-12, 0]);
    expect(extent(rows, 1)).toEqual([-3, 4]);
    expect(extent(rows, 2)).toEqual([2, 17]);
  });

  it("should ignore null and undefined values", () => {
    expect(extent([[null], [1], [undefined]], 0)).toEqual([1, 1]);
  });
});
