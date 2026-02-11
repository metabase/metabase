import * as Lib from "metabase-lib";

import { compileExpression } from "./compile-expression";
import {
  expressions,
  fields,
  query,
  segments,
  stageIndex,
} from "./test/shared";
import { op, opt, value } from "./test/utils";

function expr(
  source: string,
  {
    expressionMode = "expression",
  }: {
    expressionMode?: Lib.ExpressionMode;
  } = {},
) {
  const { expressionParts, error } = compileExpression({
    source,
    expressionMode,
    query,
    stageIndex,
    availableColumns: Lib.expressionableColumns(query, stageIndex),
  });

  if (error) {
    throw error;
  }

  return expressionParts;
}

function filter(source: string) {
  return expr(source, { expressionMode: "filter" });
}

function aggregation(source: string) {
  return expr(source, { expressionMode: "aggregation" });
}

describe("old recursive-parser tests", () => {
  it("should parse numeric literals", () => {
    // Numbers are returned as raw values (except bigints which need type info)
    expect(expr("0")).toEqual(0);
    expect(expr("42")).toEqual(42);
    expect(expr("1.0")).toEqual(1);
    expect(expr("0.123")).toEqual(0.123);
    // Bigints are wrapped because they serialize as strings
    expect(expr("9223372036854775807")).toEqual(
      value("9223372036854775807", "type/BigInteger"),
    );
  });

  it("should parse string literals", () => {
    // Strings are returned as raw values
    expect(expr("'Universe'")).toEqual("Universe");
    expect(expr('"answer"')).toEqual("answer");
    expect(expr('"\\""')).toEqual('"');

    expect(expr("length('Universe')")).toEqual(op("length", "Universe"));
    expect(expr('length("answer")')).toEqual(op("length", "answer"));
    expect(expr('length("\\"")')).toEqual(op("length", '"'));
  });

  it("should parse field references", () => {
    expect(expr("[Total]")).toEqual(fields.orders.TOTAL);
    expect(expr("Subtotal")).toEqual(fields.orders.SUBTOTAL);
  });

  it("should parse bracketed field references (with escaping)", () => {
    expect(expr("[name with \\[brackets\\]]")).toEqual(
      expressions.NAME_WITH_BRACKETS,
    );
    expect(expr("[name with \\ slash]")).toEqual(expressions.NAME_WITH_SLASH);
  });

  it("should parse unary expressions", () => {
    expect(expr("+6")).toEqual(6);
    expect(expr("++7")).toEqual(7);
    expect(expr("-+8")).toEqual(-8);
  });

  it("should flatten unary expressions", () => {
    expect(expr("--5")).toEqual(5);
    expect(expr("- 6")).toEqual(-6);
    expect(expr("+-7")).toEqual(-7);
    expect(expr("sqrt(-1)")).toEqual(op("sqrt", -1));
    expect(expr("- [Total]")).toEqual(op("-", fields.orders.TOTAL));
    expect(expr("-[Total]")).toEqual(op("-", fields.orders.TOTAL));
    expect(expr("+ [Total]")).toEqual(fields.orders.TOTAL);
    expect(expr("+[Total]")).toEqual(fields.orders.TOTAL);
  });

  it("should parse binary expressions", () => {
    expect(expr("14 * 3")).toEqual(op("*", 14, 3));
    expect(expr("84 / 2")).toEqual(op("/", 84, 2));
    expect(expr("5 + 37")).toEqual(op("+", 5, 37));
    expect(expr("50 - 8")).toEqual(op("-", 50, 8));
  });

  it("should flatten binary expressions with more terms/factors", () => {
    expect(expr("2 + 4 + 8")).toEqual(op("+", 2, 4, 8));
    expect(expr("3 - 6 + 9")).toEqual(op("+", op("-", 3, 6), 9));
    expect(expr("1 / 2 / 3")).toEqual(op("/", 1, 2, 3));
    expect(expr("4 * 2 / 1")).toEqual(op("/", op("*", 4, 2), 1));
    expect(expr("6 * 7 * 8")).toEqual(op("*", 6, 7, 8));
    expect(expr("1/2*(3*4)")).toEqual(op("*", op("/", 1, 2), op("*", 3, 4)));
    expect(expr("-1-(2-3)")).toEqual(op("-", -1, op("-", 2, 3)));
  });

  it("should honor operator precedence", () => {
    expect(expr("1 + 2 * 3")).toEqual(op("+", 1, op("*", 2, 3)));
    expect(expr("1 + 2 + 3 * 4")).toEqual(op("+", 1, 2, op("*", 3, 4)));
  });

  it("should parse grouped expressions in parentheses", () => {
    expect(expr("(1 + 2) * 3")).toEqual(op("*", op("+", 1, 2), 3));
    expect(expr("4 / (5 - 6) * 7")).toEqual(
      op("*", op("/", 4, op("-", 5, 6)), 7),
    );
    expect(expr("7 * (8 + 9) - 1")).toEqual(
      op("-", op("*", 7, op("+", 8, 9)), 1),
    );
  });

  it("should parse function calls", () => {
    expect(expr("ceil(3.14)")).toEqual(op("ceil", 3.14));
    expect(expr("log(1 + sqrt(9))")).toEqual(
      op("log", op("+", 1, op("sqrt", 9))),
    );
    expect(expr("power(log(2.1), 7)")).toEqual(op("power", op("log", 2.1), 7));
    expect(expr("trim(ID)")).toEqual(op("trim", fields.orders.ID));
  });

  it("should parse cast calls", () => {
    expect(expr("text(ID)")).toEqual(op("text", fields.orders.ID));
    expect(expr("integer(ID)")).toEqual(op("integer", fields.orders.ID));
  });

  it("should handle CASE expression", () => {
    expect(expr("CASE([Total] = 1, 'A')")).toEqual(
      op("case", op("=", fields.orders.TOTAL, 1), "A"),
    );

    expect(expr("CASE([Total] = 1, 'A', [Total] = 2, 'B')")).toEqual(
      op(
        "case",
        op("=", fields.orders.TOTAL, 1),
        "A",
        op("=", fields.orders.TOTAL, 2),
        "B",
      ),
    );

    expect(expr("CASE([Total] = 1, 'A', 'B')")).toEqual(
      op("case", op("=", fields.orders.TOTAL, 1), "A", "B"),
    );

    expect(expr("CASE([Total] = 1, 'A', [Total] = 2, 'B', 'C')")).toEqual(
      op(
        "case",
        op("=", fields.orders.TOTAL, 1),
        "A",
        op("=", fields.orders.TOTAL, 2),
        "B",
        "C",
      ),
    );
  });

  it("should handle IF expression", () => {
    expect(expr("if([Total] = 1, 'A')")).toEqual(
      op("if", op("=", fields.orders.TOTAL, 1), "A"),
    );

    expect(expr("if([Total] = 1, 'A', [Total] = 2, 'B')")).toEqual(
      op(
        "if",
        op("=", fields.orders.TOTAL, 1),
        "A",
        op("=", fields.orders.TOTAL, 2),
        "B",
      ),
    );

    expect(expr("if([Total] = 1, 'A', 'B')")).toEqual(
      op("if", op("=", fields.orders.TOTAL, 1), "A", "B"),
    );

    expect(expr("if([Total] = 1, 'A', [Total] = 2, 'B', 'C')")).toEqual(
      op(
        "if",
        op("=", fields.orders.TOTAL, 1),
        "A",
        op("=", fields.orders.TOTAL, 2),
        "B",
        "C",
      ),
    );
  });

  it("should use MBQL canonical function names", () => {
    expect(expr("regexextract('A', 'B')")).toEqual(
      op("regex-match-first", "A", "B"),
    );
  });

  it.each([
    {
      source: "contains('A', 'case-insensitive')",
      expression: opt("contains", { "case-sensitive": false }, "A"),
    },
    {
      source: "contains('A', 'B', 'case-insensitive')",
      expression: opt("contains", { "case-sensitive": false }, "A", "B"),
    },
    {
      source: "contains('A','B','C')",
      expression: opt("contains", {}, "A", "B", "C"),
    },
    {
      source: "contains('A', 'B', 'C', 'case-insensitive')",
      expression: opt("contains", { "case-sensitive": false }, "A", "B", "C"),
    },
    {
      source: "doesNotContain('A', 'B', 'C', 'case-insensitive')",
      expression: opt(
        "does-not-contain",
        { "case-sensitive": false },
        "A",
        "B",
        "C",
      ),
    },
    {
      source: "startsWith('A', 'B', 'C',, 'case-insensitive')",
      expression: opt(
        "starts-with",
        { "case-sensitive": false },
        "A",
        "B",
        "C",
      ),
    },
    {
      source: "endsWith('A', 'B', 'C',, 'case-insensitive')",
      expression: opt("ends-with", { "case-sensitive": false }, "A", "B", "C"),
    },
    {
      source: "case(contains('A', 'B', 'C'), 1, 2)",
      expression: op("case", op("contains", "A", "B", "C"), 1, 2),
    },
    {
      source: "case(contains('A', 'B', 'case-insensitive'), 1, 2)",
      expression: op(
        "case",
        opt("contains", { "case-sensitive": false }, "A", "B"),
        1,
        2,
      ),
    },
    {
      source: "case(contains('A', 'B', 'C', 'case-insensitive'), 1, 2)",
      expression: op(
        "case",
        opt("contains", { "case-sensitive": false }, "A", "B", "C"),
        1,
        2,
      ),
    },
    {
      source:
        "case(contains('A', 'B', 'C', 'case-insensitive'), 1, contains('D', 'E', 'F', 'case-insensitive'), 2, 3)",
      expression: op(
        "case",
        opt("contains", { "case-sensitive": false }, "A", "B", "C"),
        1,
        opt("contains", { "case-sensitive": false }, "D", "E", "F"),
        2,
        3,
      ),
    },
    {
      source:
        "case(contains('A', 'B', 'case-insensitive'), 9223372036854775807, 0)",
      expression: op(
        "case",
        opt("contains", { "case-sensitive": false }, "A", "B"),
        value("9223372036854775807", "type/BigInteger"),
        0,
      ),
    },
    {
      source:
        "case(contains('A', 'B', 'case-insensitive'), 0, 9223372036854775807)",
      expression: op(
        "case",
        opt("contains", { "case-sensitive": false }, "A", "B"),
        0,
        value("9223372036854775807", "type/BigInteger"),
      ),
    },
    {
      source: "interval([Created At], -1, 'days', 'include-current')",
      expression: opt(
        "time-interval",
        { "include-current": true },
        fields.orders.CREATED_AT,
        -1,
        "days",
      ),
    },
    {
      source: "intervalStartingFrom([Created At], -1, 'days', -5, 'years')",
      expression: op(
        "relative-time-interval",
        fields.orders.CREATED_AT,
        -1,
        "days",
        -5,
        "years",
      ),
    },
  ])("should handle function options: $source", ({ source, expression }) => {
    expect(filter(source)).toEqual(expression);
  });

  it("should use MBQL negative shorthands", () => {
    expect(filter("NOT IsNull(1)")).toEqual(op("not", op("is-null", 1)));
    expect(filter("NOT IsEmpty(2 + 3)")).toEqual(
      op("not", op("is-empty", op("+", 2, 3))),
    );
    expect(filter("NOT contains('A', 'B')")).toEqual(
      op("not", op("contains", "A", "B")),
    );
  });

  it("should parse booleans", () => {
    expect(expr("[Total] = true")).toEqual(op("=", fields.orders.TOTAL, true));
    expect(expr("[Total] = True")).toEqual(op("=", fields.orders.TOTAL, true));
    expect(expr("[Total] = false")).toEqual(
      op("=", fields.orders.TOTAL, false),
    );
    expect(expr("[Total] = False")).toEqual(
      op("=", fields.orders.TOTAL, false),
    );
  });

  it("should parse comparisons", () => {
    expect(expr("round(3.14) = 3")).toEqual(op("=", op("round", 3.14), 3));
    expect(expr("[Tax] != 0")).toEqual(op("!=", fields.orders.TAX, 0));
    expect(expr("[Tax] <= 4")).toEqual(op("<=", fields.orders.TAX, 4));
    expect(expr("[Tax] > -4")).toEqual(op(">", fields.orders.TAX, -4));
  });

  it("should parse boolean unary expressions", () => {
    expect(expr("NOT [bool]")).toEqual(op("not", expressions.BOOL));
    expect(expr("NOT NOT [bool]")).toEqual(
      op("not", op("not", expressions.BOOL)),
    );
  });

  it("should parse boolean binary expressions", () => {
    expect(expr("[bool] AND [bool]")).toEqual(
      op("and", expressions.BOOL, expressions.BOOL),
    );
    expect(expr("[bool] OR [bool]")).toEqual(
      op("or", expressions.BOOL, expressions.BOOL),
    );
  });

  it("should honor boolean precedence", () => {
    expect(expr("NOT [bool] OR [bool]")).toEqual(
      op("or", op("not", expressions.BOOL), expressions.BOOL),
    );
    expect(expr("[bool] OR NOT [bool]")).toEqual(
      op("or", expressions.BOOL, op("not", expressions.BOOL)),
    );
    expect(expr("NOT [bool] OR NOT [bool]")).toEqual(
      op("or", op("not", expressions.BOOL), op("not", expressions.BOOL)),
    );
    expect(expr("not [bool] and [bool]")).toEqual(
      op("and", op("not", expressions.BOOL), expressions.BOOL),
    );
    expect(expr("[bool] and not [bool]")).toEqual(
      op("and", expressions.BOOL, op("not", expressions.BOOL)),
    );
    expect(expr("not [bool] and not [bool]")).toEqual(
      op("and", op("not", expressions.BOOL), op("not", expressions.BOOL)),
    );
  });

  it("should detect aggregation functions with no argument", () => {
    // sanity check first
    expect(aggregation("SUM([Total])")).toEqual(op("sum", fields.orders.TOTAL));
    expect(aggregation("Max([Tax])")).toEqual(op("max", fields.orders.TAX));
    expect(aggregation("Average(Subtotal)")).toEqual(
      op("avg", fields.orders.SUBTOTAL),
    );

    // functions without argument, hence no "()"
    expect(aggregation("Count()")).toEqual(op("count"));
    expect(aggregation("CumulativeCount()")).toEqual(op("cum-count"));

    // mixed them in some arithmetic
    expect(aggregation("COUNT() / 2")).toEqual(op("/", op("count"), 2));
    expect(aggregation("1+CumulativeCount()")).toEqual(
      op("+", 1, op("cum-count")),
    );
  });

  it("should handle aggregation with another function", () => {
    expect(aggregation("floor(Sum([Tax]))")).toEqual(
      op("floor", op("sum", fields.orders.TAX)),
    );
    expect(aggregation("round(Distinct([Tax])/2)")).toEqual(
      op("round", op("/", op("distinct", fields.orders.TAX), 2)),
    );
  });

  it("should resolve segments", () => {
    expect(filter("[Expensive Things]")).toEqual(segments.EXPENSIVE_THINGS);
    expect(expr("NOT [Expensive Things]")).toEqual(
      op("not", segments.EXPENSIVE_THINGS),
    );
  });
});

describe("Specific expressions", () => {
  it("should allow using OFFSET as a CASE argument (metabase#42377)", () => {
    expect(expr(`Sum(case([Total] > 0, Offset([Total], -1)))`)).toEqual(
      op(
        "sum",
        op(
          "case",
          op(">", fields.orders.TOTAL, 0),
          op("offset", fields.orders.TOTAL, -1),
        ),
      ),
    );
  });

  it("should support negated numbers", () => {
    expect(expr(`-10`)).toEqual(-10);
    expect(expr(`-3.1415`)).toEqual(-3.1415);
    // Bigints are still wrapped because they need to be serialized as strings
    expect(expr(`-9223372036854775809`)).toEqual(
      value("-9223372036854775809", "type/BigInteger"),
    );
  });

  it("should render a custom error message for unresolved fields that used to resolver to a function invocation", () => {
    expect(() => expr("now")).toThrow(
      "Unknown column: now. Use now() instead.",
    );
    expect(() => expr("Count")).toThrow(
      "Unknown column: Count. Use Count() instead.",
    );
    expect(() => expr("CumulativeCount")).toThrow(
      "Unknown column: CumulativeCount. Use CumulativeCount() instead.",
    );
  });
});
