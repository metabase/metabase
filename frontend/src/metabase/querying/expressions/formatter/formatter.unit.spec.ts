/* eslint-disable jest/expect-expect */
import expression from "ts-dedent";

import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import { createQuery } from "metabase-lib/test-helpers";

import { compileExpression } from "../compile-expression";
import {
  expressions,
  fields,
  measures,
  metrics,
  query,
  segments,
  stageIndex,
} from "../test/shared";
import { op, opt } from "../test/utils";

import { format, formatExpressionParts } from "./formatter";

function setup(
  printWidth: number,
  expressionMode: Lib.ExpressionMode = "expression",
) {
  async function assertFormatted(
    expressions: string | string[],
  ): Promise<void> {
    if (!Array.isArray(expressions)) {
      return assertFormatted([expressions]);
    }

    for (const source of expressions) {
      const options = {
        query,
        expressionMode,
        stageIndex,
      };

      const res = compileExpression({
        ...options,
        source,
        availableColumns: Lib.expressionableColumns(query, stageIndex),
      });

      if (res.error) {
        throw res.error;
      }

      const result = await format(res.expressionClause, {
        ...options,
        printWidth,
      });

      expect(result).toBe(source);
    }
  }
  return { assertFormatted };
}

describe("format", () => {
  describe("printWidth = 25", () => {
    const { assertFormatted } = setup(25);

    it("formats nested arithmetic expressions", async () => {
      await assertFormatted([
        expression`
          1 + 1
        `,
        expression`
          1 + 2 - 3 + 4 / 5
        `,
        expression`
          1 + 2 - 3 + 4 / (5 - 6)
        `,
        expression`
          111111111 + 22222222 -
            333333333 / 44444444
        `,
        expression`
          111111111 +
            22222222 +
            333333333 / 44444444
        `,
        expression`
          111111111 +
            22222222 +
            333333333 /
              4444444444444
        `,
        expression`
          111111111 + 22222222 -
            333333333 /
              (44444444 + 555555)
        `,
        expression`
          111111111 + 22222222 -
            (333333333 - 4444444)
        `,
        expression`
          1 + 2 + 3 * 4 * 5 + 6
        `,
        expression`
          90071992547409901
        `,
        expression`
          1 + 2 - (3 + 4)
        `,
        expression`
          1 - 2 + (3 - 4)
        `,
        expression`
          1 - 2 - 3 + 4
        `,
        expression`
          1 * 2 / (3 + 4)
        `,
        expression`
          1 / 2 * (3 / 4)
        `,
        expression`
          1 / 2 / 3 * 4
        `,
        expression`
          1 * (2 + 3)
        `,
        expression`
          1 * (2 - 3)
        `,
        expression`
          1 * (2 / 3)
        `,
        expression`
          1 / (2 + 3)
        `,
        expression`
          1 / (2 - 3)
        `,
        expression`
          1 / (2 / 3)
        `,
        expression`
          1 - (2 - 3)
        `,
      ]);
    });

    it("formats function calls", async () => {
      await assertFormatted([
        expression`
          concat(
            "http://mysite.com/user/",
            [User ID],
            "/"
          )
        `,
        expression`
          case(
            [Total] > 10,
            "GOOD",
            [Total] < 5,
            "BAD",
            "OK"
          )
        `,
        expression`
          Offset([Total], -1)
        `,
        expression`
          startsWith(
            [Product → Category],
            "A",
            "B"
          )
        `,
        expression`
          startsWith(
            [Product → Category],
            "A",
            "B",
            "case-insensitive"
          )
        `,
      ]);
    });

    it("formats chained function calls", async () => {
      await assertFormatted([
        expression`
          concat("a", "b")
          AND concat("c", "d")
          AND concat("e", "f")
          AND concat("g", "h")
        `,
        expression`
          concat("foo", "bar")
          AND concat("bar", "baz")
          AND concat("quu", "qux")
          OR concat("foo", "bar")
          AND concat("bar", "baz")
        `,
        expression`
          concat("foo", "bar")
          AND (
            concat("bar", "baz")
            AND concat(
              "quu",
              "qux"
            )
            OR concat("foo", "bar")
          )
          AND concat("bar", "baz")
        `,
        expression`
          concat(
            [User ID] > 12
            AND [Total] < 10,
            "GOOD",
            "OK",
            111111111 +
              22222222 +
              333333333
          )
        `,
      ]);
    });

    it("formats unary operators", async () => {
      const { assertFormatted } = setup(25, "filter");
      await assertFormatted([
        expression`
          NOT [Total] < 10
        `,
        expression`
          NOT [Total] <
            11111111111111
        `,
        expression`
          NOT [Total] <
            22222222222222 +
              33333333333333
        `,
        expression`
          NOT concat(
            [User → Name],
            "John"
          )
          OR [User ID] = 1
        `,
        expression`
          NOT (
            [Product ID] > 10
            AND [Tax] < 10
          )
        `,
      ]);
    });
  });

  describe("printWidth = 52", () => {
    const { assertFormatted } = setup(52);

    it("formats bigintegers", async () => {
      await assertFormatted([
        expression`
          922337203685477580855
        `,
        expression`
          -922337203685477580855
        `,
        expression`
          [ID] = -922337203685477580855
        `,
      ]);
    });
  });

  describe("formats unknown references", () => {
    const otherQuery = createQuery({
      metadata: createMockMetadata({
        databases: [
          // no database so metadata cannot reference anything
        ],
      }),
    });

    it.each([
      { result: "[Unknown Field]", parts: fields.orders.TOTAL },
      { result: "[Unknown Segment]", parts: segments.EXPENSIVE_THINGS },
      { result: "[Unknown Metric]", parts: metrics.FOO },
      { result: "[Unknown Measure]", parts: measures.BAR },
    ])("should format an unknown %s as %s", async ({ result, parts }) => {
      const clause = Lib.expressionClause(parts);

      const formatted = await format(clause, {
        query: otherQuery,
        stageIndex,
      });
      expect(formatted).toBe(result);
    });
  });
});

describe("if printWidth = Infinity, it should return the same results as the single-line formatter", () => {
  async function all(cases: {
    [source: string]: Lib.ExpressionParts | Lib.ExpressionArg;
  }) {
    for (const source in cases) {
      const expression = cases[source];
      expect(
        await formatExpressionParts(expression, {
          query,
          stageIndex,
        }),
      ).toBe(source);
    }
  }

  it("should format number literal", async () => {
    await all({
      "1": 1,
      "2": op("value", 2),
      "-42": -42,
      "-43": op("value", -43),
    });
  });

  it("should format boolean literals", async () => {
    await all({
      True: true,
      False: false,
    });
    await all({
      True: op("value", true),
      False: op("value", false),
    });
  });

  it("should format addition", async () => {
    await all({
      "1 + 2": op("+", 1, 2),
      "1 + 2 + 3": op("+", 1, 2, 3),
      "1 + -2 + 3": op("+", 1, -2, 3),
    });
  });

  it("should format operators ordered by precedence", async () => {
    await all({
      "1 * 2 + 3": op("+", op("*", 1, 2), 3),
      "1 + 2 * 3": op("+", 1, op("*", 2, 3)),
      "1 + 2 * 3 + 4": op("+", 1, op("*", 2, 3), 4),
      "1 + 2 + 3 * 4 * 5 + 6": op("+", 1, 2, op("*", 3, 4, 5), 6),
    });
  });

  it("should parenthesize operators with lower precedence", async () => {
    await all({
      "1 * (2 + 3)": op("*", 1, op("+", 2, 3)),
      "(1 + 2) * 3": op("*", op("+", 1, 2), 3),
    });
  });

  it("should format string literals", async () => {
    await all({
      '"foo bar"': "foo bar",
      '"hello world"': op("value", "hello world"),
      '""': op("value", ""),
    });
  });

  it("should format field references", async () => {
    await all({
      "[Subtotal]": fields.orders.SUBTOTAL,
      "[Tax] + [Subtotal]": op("+", fields.orders.TAX, fields.orders.SUBTOTAL),
      "1 + [Subtotal]": op("+", 1, fields.orders.SUBTOTAL),
      "[User ID]": fields.orders.USER_ID,
      "[User → Name]": fields.people.NAME,
    });
  });

  it("should format function calls", async () => {
    await all({
      "now()": op("now"),
      "trim([User → Name])": op("trim", fields.people.NAME),
      'coalesce([User → Name], ",")': op("coalesce", fields.people.NAME, ","),
      'concat("http://mysite.com/user/", [User ID], "/")': op(
        "concat",
        "http://mysite.com/user/",
        fields.orders.USER_ID,
        "/",
      ),
      "text([User ID])": op("text", fields.orders.USER_ID),
      'integer("10")': op("integer", "10"),
      'date("2025-03-20")': op("date", "2025-03-20"),
    });
  });

  it("should format case/if statements", async () => {
    await all({
      'case([Total] > 10, "GOOD", [Total] < 5, "BAD", "OK")': op(
        "case",
        op(">", fields.orders.TOTAL, 10),
        "GOOD",
        op("<", fields.orders.TOTAL, 5),
        "BAD",
        "OK",
      ),
      'if([Total] > 10, "GOOD", [Total] < 5, "BAD", "OK")': op(
        "if",
        op(">", fields.orders.TOTAL, 10),
        "GOOD",
        op("<", fields.orders.TOTAL, 5),
        "BAD",
        "OK",
      ),
    });
  });

  it("should format addition of a string to a number", async () => {
    await all({
      [`"Hell" + 1`]: op("+", "Hell", 1),
    });
  });

  it("should give priority multiply and division without parenthesis", async () => {
    await all({
      "floor([Total]) / ceil([Product → Price]) * round([Tax])": op(
        "*",
        op(
          "/",
          op("floor", fields.orders.TOTAL),
          op("ceil", fields.products.PRICE),
        ),
        op("round", fields.orders.TAX),
      ),
    });
  });

  it("should handle priority for addition and subtraction without parenthesis", async () => {
    await all({
      "floor([Total]) - ceil([Product → Price]) + round([Tax])": op(
        "+",
        op(
          "-",
          op("floor", fields.orders.TOTAL),
          op("ceil", fields.products.PRICE),
        ),
        op("round", fields.orders.TAX),
      ),
      "floor([Total]) - (ceil([Product → Price]) + round([Tax]))": op(
        "-",
        op("floor", fields.orders.TOTAL),
        op(
          "+",
          op("ceil", fields.products.PRICE),
          op("round", fields.orders.TAX),
        ),
      ),
    });
  });

  it("should handle contains and doesNotContain with and without options", async () => {
    await all({
      'contains([Product → Ean], "A", "B")': op(
        "contains",
        fields.products.EAN,
        "A",
        "B",
      ),
      'contains([Product → Ean], "A", "B", "case-insensitive")': opt(
        "contains",
        { "case-sensitive": false },
        fields.products.EAN,
        "A",
        "B",
      ),
      'doesNotContain([User → Name], "A", "B")': op(
        "does-not-contain",
        fields.people.NAME,
        "A",
        "B",
      ),
      'doesNotContain([User → Name], "A", "B", "case-insensitive")': opt(
        "does-not-contain",
        { "case-sensitive": false },
        fields.people.NAME,
        "A",
        "B",
      ),
    });
  });

  it("should handle startsWith and endsWith with and without options", async () => {
    await all({
      'startsWith([Product → Category], "A", "B")': op(
        "starts-with",
        fields.products.CATEGORY,
        "A",
        "B",
      ),
      'startsWith([Product → Category], "A", "B", "case-insensitive")': opt(
        "starts-with",
        { "case-sensitive": false },
        fields.products.CATEGORY,
        "A",
        "B",
      ),
      'endsWith([Product → Category], "A", "B")': op(
        "ends-with",
        fields.products.CATEGORY,
        "A",
        "B",
      ),
      'endsWith([Product → Category], "A", "B", "case-insensitive")': opt(
        "ends-with",
        { "case-sensitive": false },
        fields.products.CATEGORY,
        "A",
        "B",
      ),
    });
  });

  it("should format comparisons", async () => {
    await all({
      "[Total] < 10": op("<", fields.orders.TOTAL, 10),
      "floor([Total]) < 10": op("<", op("floor", fields.orders.TOTAL), 10),
      "between([Subtotal], 1, 2)": op("between", fields.orders.SUBTOTAL, 1, 2),
    });
  });

  it("should format unary operators", async () => {
    await all({
      "NOT [Total] < 10": op("not", op("<", fields.orders.TOTAL, 10)),
    });
  });

  it("should format logical operators", async () => {
    await all({
      "[Total] < 10 AND [Tax] >= 1": op(
        "and",
        op("<", fields.orders.TOTAL, 10),
        op(">=", fields.orders.TAX, 1),
      ),
    });
  });

  it("should format date functions", async () => {
    await all({
      'interval([Created At], -1, "month")': op(
        "time-interval",
        fields.orders.CREATED_AT,
        -1,
        "month",
      ),
      'intervalStartingFrom([Created At], -1, "month", -2, "years")': op(
        "relative-time-interval",
        fields.orders.CREATED_AT,
        -1,
        "month",
        -2,
        "years",
      ),
    });
  });

  it("should format segments", async () => {
    await all({
      "[Expensive Things]": segments.EXPENSIVE_THINGS,
      "NOT [Expensive Things]": op("not", segments.EXPENSIVE_THINGS),
      "NOT NOT [Expensive Things]": op(
        "not",
        op("not", segments.EXPENSIVE_THINGS),
      ),
    });
  });

  it("should format complex expressions", async () => {
    await all({
      "NOT between([Subtotal], 3, 14) OR [Expensive Things]": op(
        "or",
        op("not", op("between", fields.orders.SUBTOTAL, 3, 14)),
        segments.EXPENSIVE_THINGS,
      ),
    });
  });

  it("should format is-null and not-null", async () => {
    await all({
      "isNull([Tax])": op("is-null", fields.orders.TAX),
      "notNull([Tax])": op("not-null", fields.orders.TAX),
      "NOT isNull([Tax])": op("not", op("is-null", fields.orders.TAX)),
      "NOT notNull([Tax])": op("not", op("not-null", fields.orders.TAX)),
    });
  });

  it("should format aggregation functions", async () => {
    await all({
      "Count()": op("count"),
      "Sum([Total])": op("sum", fields.orders.TOTAL),
      "1 - Count()": op("-", 1, op("count")),
      "Sum([Total] * 2)": op("sum", op("*", fields.orders.TOTAL, 2)),
      "1 - Sum([Total] * 2)": op(
        "-",
        1,
        op("sum", op("*", fields.orders.TOTAL, 2)),
      ),
      "1 - Sum([Total] * 2) / Count()": op(
        "-",
        1,
        op("/", op("sum", op("*", fields.orders.TOTAL, 2)), op("count")),
      ),
      "Share([Total] > 50)": op("share", op(">", fields.orders.TOTAL, 50)),
      "CountIf([Total] > 50)": op(
        "count-where",
        op(">", fields.orders.TOTAL, 50),
      ),
      "SumIf([Total] > 50)": op("sum-where", op(">", fields.orders.TOTAL, 50)),
      "Average(coalesce([Total], [Tax]))": op(
        "avg",
        op("coalesce", fields.orders.TOTAL, fields.orders.TAX),
      ),
      "CountIf([Total] + [Tax] < 52)": op(
        "count-where",
        op("<", op("+", fields.orders.TOTAL, fields.orders.TAX), 52),
      ),
      "DistinctIf([User ID], [Total] > 50)": op(
        "distinct-where",
        fields.orders.USER_ID,
        op(">", fields.orders.TOTAL, 50),
      ),
    });

    // This used to work but we no longer seem to support direct field references
    // by field id.
    // [
    //   "CountIf(49 <= [Total])",
    //   ["count-where", ["<=", 49, total]],
    //   "count-where aggregation with left-hand-side literal",
    // ],
  });

  it("should format metrics", async () => {
    await all({
      "[Foo Metric]": metrics.FOO,
    });
  });

  it("should format measures", async () => {
    await all({
      "[Bar Measure]": measures.BAR,
    });
  });

  it("should format the mode options for datetime functions", async () => {
    await all({
      'datetime(55, "unixSeconds")': opt(
        "datetime",
        { mode: "unix-seconds" },
        55,
      ),
    });

    await all({
      'datetime("2025-03-20", "iso")': opt(
        "datetime",
        { mode: "iso" },
        "2025-03-20",
      ),
    });
  });

  it("should format expressions", async () => {
    await all({
      "[bool]": expressions.BOOL,
      "[foo]": expressions.FOO,
    });
  });
});

it("should format escaped regex characters (metabase#56596)", async () => {
  const { assertFormatted } = setup(Infinity);
  await assertFormatted([
    // "foo \s bar"
    expression`
      "foo \\s bar"
    `,
    // "^[Default]\s(.*?)\s-\s"
    expression`
     "^\\[Default\\]\\s(.*?)\\s-\\s"
    `,
    // "\\"
    expression`
      "\\\\"
    `,
    // "\n\r\t\v\f\b"
    expression`
      "\\n\\r\\t\\v\\f\\b"
    `,
  ]);
});

// TODO: unskip when we have a fix for metabase#58371
// eslint-disable-next-line jest/no-disabled-tests
it.skip("should format joined columns properly (metabase#58371)", async () => {
  const query = createQuery({
    query: {
      database: 1,
      type: "query",
      query: {
        joins: [
          {
            alias: "Other Table",
            condition: [
              "=",
              [
                "field",
                "field_a",
                {
                  "base-type": "type/Number",
                },
              ],
              [
                "field",
                "field_b",
                {
                  "base-type": "type/Number",
                },
              ],
            ],
          },
        ],
        expressions: {
          foo: [
            "field",
            "Fieldname that has a non-removable dash",
            {
              "base-type": "type/Integer",
              "join-alias": "Other Table",
            },
          ],
        },
      },
    },
  });

  const expression = Lib.expressions(query, -1)[0];
  const formatted = await format(expression, {
    query,
    stageIndex: -1,
  });

  expect(formatted).toBe(
    "[Other Table → Fieldname that has a non-removable dash]",
  );
});
