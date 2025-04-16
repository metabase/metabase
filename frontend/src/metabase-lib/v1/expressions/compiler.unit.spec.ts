import {
  bool,
  created,
  id,
  query,
  segment,
  subtotal,
  tax,
  total,
} from "./__support__/shared";
import { compileExpression } from "./compiler";
import type { StartRule } from "./types";

function expr(
  source: string,
  {
    startRule = "expression",
  }: {
    startRule?: StartRule;
  } = {},
) {
  const { expression, error } = compileExpression({
    source,
    startRule,
    query,
    stageIndex: -1,
  });

  if (error) {
    throw error;
  }

  return expression;
}

function filter(source: string) {
  return expr(source, { startRule: "boolean" });
}

function aggregation(source: string) {
  return expr(source, { startRule: "aggregation" });
}

describe("old recursive-parser tests", () => {
  it("should parse numeric literals", () => {
    expect(expr("0")).toEqual(["value", 0, { base_type: "type/Integer" }]);
    expect(expr("42")).toEqual(["value", 42, { base_type: "type/Integer" }]);
    expect(expr("1.0")).toEqual(["value", 1, { base_type: "type/Integer" }]);
    expect(expr("0.123")).toEqual([
      "value",
      0.123,
      { base_type: "type/Float" },
    ]);
    expect(expr("9223372036854775807")).toEqual([
      "value",
      "9223372036854775807",
      { base_type: "type/BigInteger" },
    ]);
  });

  it("should parse string literals", () => {
    expect(expr("'Universe'")).toEqual([
      "value",
      "Universe",
      { base_type: "type/Text" },
    ]);
    expect(expr('"answer"')).toEqual([
      "value",
      "answer",
      { base_type: "type/Text" },
    ]);
    expect(expr('"\\""')).toEqual(["value", '"', { base_type: "type/Text" }]);
    expect(expr("length('Universe')")).toEqual(["length", "Universe"]);
    expect(expr('length("answer")')).toEqual(["length", "answer"]);
    expect(expr('length("\\"")')).toEqual(["length", '"']);
  });

  it("should parse field references", () => {
    expect(expr("[Total]")).toEqual(total);
    expect(expr("Subtotal")).toEqual(subtotal);
  });

  it("should parse bracketed field references (with escaping)", () => {
    expect(expr("[name with \\[brackets\\]]")).toEqual([
      "expression",
      "name with [brackets]",
      { "base-type": "type/Integer" },
    ]);
    expect(expr("[name with \\ slash]")).toEqual([
      "expression",
      "name with \\ slash",
      { "base-type": "type/Integer" },
    ]);
  });

  it("should parse unary expressions", () => {
    expect(expr("+6")).toEqual(["value", 6, { base_type: "type/Integer" }]);
    expect(expr("++7")).toEqual(["value", 7, { base_type: "type/Integer" }]);
    expect(expr("-+8")).toEqual(["value", -8, { base_type: "type/Integer" }]);
  });

  it("should flatten unary expressions", () => {
    expect(expr("--5")).toEqual(["value", 5, { base_type: "type/Integer" }]);
    expect(expr("- 6")).toEqual(["value", -6, { base_type: "type/Integer" }]);
    expect(expr("+-7")).toEqual(["value", -7, { base_type: "type/Integer" }]);
    expect(expr("sqrt(-1)")).toEqual(["sqrt", -1]);
    expect(expr("- [Total]")).toEqual(["-", total]);
    expect(expr("-[Total]")).toEqual(["-", total]);
    expect(expr("+ [Total]")).toEqual(total);
    expect(expr("+[Total]")).toEqual(total);
  });

  it("should parse binary expressions", () => {
    expect(expr("14 * 3")).toEqual(["*", 14, 3]);
    expect(expr("84 / 2")).toEqual(["/", 84, 2]);
    expect(expr("5 + 37")).toEqual(["+", 5, 37]);
    expect(expr("50 - 8")).toEqual(["-", 50, 8]);
  });

  it("should flatten binary expressions with more terms/factors", () => {
    expect(expr("2 + 4 + 8")).toEqual(["+", 2, 4, 8]);
    expect(expr("3 - 6 + 9")).toEqual(["+", ["-", 3, 6], 9]);
    expect(expr("1 / 2 / 3")).toEqual(["/", 1, 2, 3]);
    expect(expr("4 * 2 / 1")).toEqual(["/", ["*", 4, 2], 1]);
    expect(expr("6 * 7 * 8")).toEqual(["*", 6, 7, 8]);
    expect(expr("1/2*(3*4)")).toEqual(["*", ["/", 1, 2], ["*", 3, 4]]);
    expect(expr("-1-(2-3)")).toEqual(["-", -1, ["-", 2, 3]]);
  });

  it("should honor operator precedence", () => {
    expect(expr("1 + 2 * 3")).toEqual(["+", 1, ["*", 2, 3]]);
    expect(expr("1 + 2 + 3 * 4")).toEqual(["+", 1, 2, ["*", 3, 4]]);
  });

  it("should parse grouped expressions in parentheses", () => {
    expect(expr("(1 + 2) * 3")).toEqual(["*", ["+", 1, 2], 3]);
    expect(expr("4 / (5 - 6) * 7")).toEqual(["*", ["/", 4, ["-", 5, 6]], 7]);
    expect(expr("7 * (8 + 9) - 1")).toEqual(["-", ["*", 7, ["+", 8, 9]], 1]);
  });

  it("should parse function calls", () => {
    expect(expr("ceil(3.14)")).toEqual(["ceil", 3.14]);
    expect(expr("log(1 + sqrt(9))")).toEqual(["log", ["+", 1, ["sqrt", 9]]]);
    expect(expr("power(log(2.1), 7)")).toEqual(["power", ["log", 2.1], 7]);
    expect(expr("trim(ID)")).toEqual(["trim", id]);
  });

  it("should parse cast calls", () => {
    expect(expr("text(ID)")).toEqual(["text", id]);
    expect(expr("integer(ID)")).toEqual(["integer", id]);
  });

  it("should handle CASE expression", () => {
    expect(expr("CASE([Total] = 1, 'A')")).toEqual([
      "case",
      [[["=", total, 1], "A"]],
    ]);

    expect(expr("CASE([Total] = 1, 'A', [Total] = 2, 'B')")).toEqual([
      "case",
      [
        [["=", total, 1], "A"],
        [["=", total, 2], "B"],
      ],
    ]);

    expect(expr("CASE([Total] = 1, 'A', 'B')")).toEqual([
      "case",
      [[["=", total, 1], "A"]],
      { default: "B" },
    ]);

    expect(expr("CASE([Total] = 1, 'A', [Total] = 2, 'B', 'C')")).toEqual([
      "case",
      [
        [["=", total, 1], "A"],
        [["=", total, 2], "B"],
      ],
      { default: "C" },
    ]);
  });

  it("should handle IF expression", () => {
    expect(expr("IF([Total] = 1, 'A')")).toEqual([
      "if",
      [[["=", total, 1], "A"]],
    ]);

    expect(expr("IF([Total] = 1, 'A', [Total] = 2, 'B')")).toEqual([
      "if",
      [
        [["=", total, 1], "A"],
        [["=", total, 2], "B"],
      ],
    ]);

    expect(expr("IF([Total] = 1, 'A', 'B')")).toEqual([
      "if",
      [[["=", total, 1], "A"]],
      { default: "B" },
    ]);

    expect(expr("IF([Total] = 1, 'A', [Total] = 2, 'B', 'C')")).toEqual([
      "if",
      [
        [["=", total, 1], "A"],
        [["=", total, 2], "B"],
      ],
      { default: "C" },
    ]);
  });

  it("should use MBQL canonical function names", () => {
    expect(expr("regexextract('A', 'B')")).toEqual([
      "regex-match-first",
      "A",
      "B",
    ]);
  });

  it.each([
    {
      source: "contains('A', 'case-insensitive')",
      expression: ["contains", "A", { "case-sensitive": false }],
    },
    {
      source: "contains('A', 'B', 'case-insensitive')",
      expression: ["contains", "A", "B", { "case-sensitive": false }],
    },
    {
      source: "contains('A','B','C')",
      expression: ["contains", {}, "A", "B", "C"],
    },
    {
      source: "contains('A', 'B', 'C', 'case-insensitive')",
      expression: ["contains", { "case-sensitive": false }, "A", "B", "C"],
    },
    {
      source: "doesNotContain('A', 'B', 'C', 'case-insensitive')",
      expression: [
        "does-not-contain",
        { "case-sensitive": false },
        "A",
        "B",
        "C",
      ],
    },
    {
      source: "startsWith('A', 'B', 'C',, 'case-insensitive')",
      expression: ["starts-with", { "case-sensitive": false }, "A", "B", "C"],
    },
    {
      source: "endsWith('A', 'B', 'C',, 'case-insensitive')",
      expression: ["ends-with", { "case-sensitive": false }, "A", "B", "C"],
    },
    {
      source: "case(contains('A', 'B', 'C'), 1, 2)",
      expression: [
        "case",
        [[["contains", {}, "A", "B", "C"], 1]],
        { default: 2 },
      ],
    },
    {
      source: "case(contains('A', 'B', 'case-insensitive'), 1, 2)",
      expression: [
        "case",
        [[["contains", "A", "B", { "case-sensitive": false }], 1]],
        { default: 2 },
      ],
    },
    {
      source: "case(contains('A', 'B', 'C', 'case-insensitive'), 1, 2)",
      expression: [
        "case",
        [[["contains", { "case-sensitive": false }, "A", "B", "C"], 1]],
        { default: 2 },
      ],
    },
    {
      source:
        "case(contains('A', 'B', 'C', 'case-insensitive'), 1, contains('D', 'E', 'F', 'case-insensitive'), 2, 3)",
      expression: [
        "case",
        [
          [["contains", { "case-sensitive": false }, "A", "B", "C"], 1],
          [["contains", { "case-sensitive": false }, "D", "E", "F"], 2],
        ],
        { default: 3 },
      ],
    },
    {
      source:
        "case(contains('A', 'B', 'case-insensitive'), 9223372036854775807, 0)",
      expression: [
        "case",
        [
          [
            ["contains", "A", "B", { "case-sensitive": false }],
            ["value", "9223372036854775807", { base_type: "type/BigInteger" }],
          ],
        ],
        { default: 0 },
      ],
    },
    {
      source:
        "case(contains('A', 'B', 'case-insensitive'), 0, 9223372036854775807)",
      expression: [
        "case",
        [[["contains", "A", "B", { "case-sensitive": false }], 0]],
        {
          default: [
            "value",
            "9223372036854775807",
            { base_type: "type/BigInteger" },
          ],
        },
      ],
    },
    {
      source: "interval([Created At], -1, 'days', 'include-current')",
      expression: [
        "time-interval",
        created,
        -1,
        "days",
        { "include-current": true },
      ],
    },
    {
      source: "intervalStartingFrom([Created At], -1, 'days', -5, 'years')",
      expression: ["relative-time-interval", created, -1, "days", -5, "years"],
    },
  ])("should handle function options: $source", ({ source, expression }) => {
    expect(filter(source)).toEqual(expression);
  });

  it("should use MBQL negative shorthands", () => {
    expect(filter("NOT IsNull(1)")).toEqual(["not", ["is-null", 1]]);
    expect(filter("NOT IsEmpty(2 + 3)")).toEqual([
      "not",
      ["is-empty", ["+", 2, 3]],
    ]);
    expect(filter("NOT contains('A', 'B')")).toEqual([
      "not",
      ["contains", "A", "B"],
    ]);
  });

  it("should parse booleans", () => {
    expect(expr("[Total] = true")).toEqual(["=", total, true]);
    expect(expr("[Total] = True")).toEqual(["=", total, true]);
    expect(expr("[Total] = false")).toEqual(["=", total, false]);
    expect(expr("[Total] = False")).toEqual(["=", total, false]);
  });

  it("should parse comparisons", () => {
    expect(expr("round(3.14) = 3")).toEqual(["=", ["round", 3.14], 3]);
    expect(expr("[Tax] != 0")).toEqual(["!=", tax, 0]);
    expect(expr("[Tax] <= 4")).toEqual(["<=", tax, 4]);
    expect(expr("[Tax] > -4")).toEqual([">", tax, -4]);
  });

  it("should parse boolean unary expressions", () => {
    expect(expr("NOT [bool]")).toEqual(["not", bool]);
    expect(expr("NOT NOT [bool]")).toEqual(["not", ["not", bool]]);
  });

  it("should parse boolean binary expressions", () => {
    expect(expr("[bool] AND [bool]")).toEqual(["and", bool, bool]);
    expect(expr("[bool] OR [bool]")).toEqual(["or", bool, bool]);
  });

  it("should honor boolean precedence", () => {
    expect(expr("NOT [bool] OR [bool]")).toEqual(["or", ["not", bool], bool]);
    expect(expr("[bool] OR NOT [bool]")).toEqual(["or", bool, ["not", bool]]);
    expect(expr("NOT [bool] OR NOT [bool]")).toEqual([
      "or",
      ["not", bool],
      ["not", bool],
    ]);
    expect(expr("not [bool] and [bool]")).toEqual(["and", ["not", bool], bool]);
    expect(expr("[bool] and not [bool]")).toEqual(["and", bool, ["not", bool]]);
    expect(expr("not [bool] and not [bool]")).toEqual([
      "and",
      ["not", bool],
      ["not", bool],
    ]);
  });

  it("should detect aggregation functions with no argument", () => {
    // sanity check first
    expect(aggregation("SUM([Total])")).toEqual(["sum", total]);
    expect(aggregation("Max([Tax])")).toEqual(["max", tax]);
    expect(aggregation("Average(Subtotal)")).toEqual(["avg", subtotal]);

    // functions without argument, hence no "()"
    expect(aggregation("Count")).toEqual(["count"]);
    expect(aggregation("CumulativeCount")).toEqual(["cum-count"]);

    // mixed them in some arithmetic
    expect(aggregation("COUNT / 2")).toEqual(["/", ["count"], 2]);
    expect(aggregation("1+CumulativeCount")).toEqual(["+", 1, ["cum-count"]]);
  });

  it("should handle aggregation with another function", () => {
    expect(aggregation("floor(Sum([Tax]))")).toEqual(["floor", ["sum", tax]]);
    expect(aggregation("round(Distinct([Tax])/2)")).toEqual([
      "round",
      ["/", ["distinct", tax], 2],
    ]);
  });

  it("should resolve segments", () => {
    expect(filter("[Expensive Things]")).toEqual(segment);
    expect(expr("NOT [Expensive Things]")).toEqual(["not", segment]);
  });
});

describe("Specific expressions", () => {
  it("should allow using OFFSET as a CASE argument (metabase#42377)", () => {
    expect(expr(`Sum(case([Total] > 0, Offset([Total], -1)))`)).toEqual([
      "sum",
      [
        "case",
        [
          [
            [">", ["field", 13, { "base-type": "type/Float" }], 0],
            [
              "offset",
              { "lib/uuid": expect.any(String) },
              ["field", 13, { "base-type": "type/Float" }],
              -1,
            ],
          ],
        ],
      ],
    ]);
  });

  it("should support negated numbers", () => {
    expect(expr(`-10`)).toEqual(["value", -10, { base_type: "type/Integer" }]);
    expect(expr(`-3.1415`)).toEqual([
      "value",
      -3.1415,
      { base_type: "type/Float" },
    ]);
    expect(expr(`-9223372036854775809`)).toEqual([
      "value",
      "-9223372036854775809",
      { base_type: "type/BigInteger" },
    ]);
  });
});
