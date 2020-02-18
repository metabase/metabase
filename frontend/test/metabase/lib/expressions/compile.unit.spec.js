import { compile } from "metabase/lib/expressions/compile";

import {
  aggregationOpts,
  expressionOpts,
  filterOpts,
} from "./__support__/expressions";

describe("compile()", () => {
  it("should return empty array for null or empty string", () => {
    expect(compile()).toEqual([]);
    expect(compile(null)).toEqual([]);
    expect(compile("")).toEqual([]);
  });

  describe("expressions", () => {
    it("can parse simple expressions", () => {
      expect(compile("A", expressionOpts)).toEqual(["field-id", 1]);
      expect(compile("1", expressionOpts)).toEqual(1);
      expect(compile("1.1", expressionOpts)).toEqual(1.1);
    });

    it("can parse single operator math", () => {
      expect(compile("A-B", expressionOpts)).toEqual([
        "-",
        ["field-id", 1],
        ["field-id", 2],
      ]);
      expect(compile("A - B", expressionOpts)).toEqual([
        "-",
        ["field-id", 1],
        ["field-id", 2],
      ]);
      expect(compile("1 - B", expressionOpts)).toEqual([
        "-",
        1,
        ["field-id", 2],
      ]);
      expect(compile("1 - 2", expressionOpts)).toEqual(["-", 1, 2]);
    });

    it("can handle operator precedence", () => {
      expect(compile("1 + 2 * 3", expressionOpts)).toEqual([
        "+",
        1,
        ["*", 2, 3],
      ]);
      expect(compile("1 * 2 + 3", expressionOpts)).toEqual([
        "+",
        ["*", 1, 2],
        3,
      ]);
    });

    it("can collapse consecutive identical operators", () => {
      expect(compile("1 + 2 + 3 * 4 * 5", expressionOpts)).toEqual([
        "+",
        1,
        2,
        ["*", 3, 4, 5],
      ]);
    });

    it("can handle negative number literals", () => {
      expect(compile("1 + -1", expressionOpts)).toEqual(["+", 1, -1]);
    });

    // quoted field name w/ a space in it
    it("can parse a field with quotes and spaces", () => {
      expect(compile('"Toucan Sam" + B', expressionOpts)).toEqual([
        "+",
        ["field-id", 10],
        ["field-id", 2],
      ]);
    });

    // parentheses / nested parens
    it("can parse expressions with parentheses", () => {
      expect(compile("(1 + 2) * 3", expressionOpts)).toEqual([
        "*",
        ["+", 1, 2],
        3,
      ]);
      expect(compile("1 * (2 + 3)", expressionOpts)).toEqual([
        "*",
        1,
        ["+", 2, 3],
      ]);
      expect(compile('"Toucan Sam" + (A * (B / C))', expressionOpts)).toEqual([
        "+",
        ["field-id", 10],
        ["*", ["field-id", 1], ["/", ["field-id", 2], ["field-id", 3]]],
      ]);
    });

    it("can parse string literals", () => {
      expect(compile("'hello'", expressionOpts)).toEqual("hello");
    });

    it("can parse functions", () => {
      expect(compile("trim(A)", expressionOpts)).toEqual([
        "trim",
        ["field-id", 1],
      ]);
    });

    it("can parse functions with multiple arguments", () => {
      expect(compile("substring(A, 1, 2)", expressionOpts)).toEqual([
        "substring",
        ["field-id", 1],
        1,
        2,
      ]);
    });
  });

  describe("aggregations", () => {
    it("can parse aggregation with no arguments", () => {
      expect(compile("Count", aggregationOpts)).toEqual(["count"]);
      expect(compile("Count()", aggregationOpts)).toEqual(["count"]);
    });

    it("can parse aggregation with argument", () => {
      expect(compile("Sum(A)", aggregationOpts)).toEqual([
        "sum",
        ["field-id", 1],
      ]);
    });

    it("can handle negative number literals in aggregations", () => {
      expect(compile("-1 * Count", aggregationOpts)).toEqual([
        "*",
        -1,
        ["count"],
      ]);
    });

    it("can parse complex aggregation", () => {
      expect(compile("1 - Sum(A * 2) / Count", aggregationOpts)).toEqual([
        "-",
        1,
        ["/", ["sum", ["*", ["field-id", 1], 2]], ["count"]],
      ]);
    });

    it("should throw exception on invalid input", () => {
      expect(() => compile("1 + ", expressionOpts)).toThrow();
    });

    it("should treat aggregations as case-insensitive", () => {
      expect(compile("count", aggregationOpts)).toEqual(["count"]);
      expect(compile("cOuNt", aggregationOpts)).toEqual(["count"]);
      expect(compile("average(A)", aggregationOpts)).toEqual([
        "avg",
        ["field-id", 1],
      ]);
    });

    // fks
    // multiple tables with the same field name resolution
  });

  describe("filters", () => {
    it("can parse filter operators", () => {
      expect(compile("A = 42", filterOpts)).toEqual(["=", ["field-id", 1], 42]);
    });
    it("can parse AND operators", () => {
      expect(compile("A = 42 AND B = 41", filterOpts)).toEqual([
        "and",
        ["=", ["field-id", 1], 42],
        ["=", ["field-id", 2], 41],
      ]);
    });
  });
});
