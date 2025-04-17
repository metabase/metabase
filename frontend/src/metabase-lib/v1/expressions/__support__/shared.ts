import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/lib/types";
import { createQuery, createQueryWithClauses } from "metabase-lib/test-helpers";
import type {
  Expression,
  LocalFieldReference,
  MetricAgg,
  ReferenceOptions,
} from "metabase-types/api";
import {
  COMMON_DATABASE_FEATURES,
  createMockCard,
  createMockSegment,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PEOPLE,
  PRODUCTS,
  SAMPLE_DB_ID,
  createOrdersTable,
  createPeopleTable,
  createProductsTable,
  createReviewsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import type { FormatClauseOptions } from "../formatter";

const SEGMENT_ID = 1;
const METRIC_ID = 2;

const metadata = createMockMetadata({
  databases: [
    createSampleDatabase({
      features: [
        ...COMMON_DATABASE_FEATURES,
        "expressions/date",
        "expressions/integer",
        "expressions/date",
      ],
      tables: [
        createPeopleTable(),
        createProductsTable(),
        createReviewsTable(),
        createOrdersTable({
          segments: [
            createMockSegment({
              id: SEGMENT_ID,
              name: "Expensive Things",
              table_id: ORDERS_ID,
              definition: {
                filter: [">", ["field", ORDERS.TOTAL, null], 30],
                "source-table": ORDERS_ID,
              },
            }),
          ],
          metrics: [
            createMockCard({
              id: METRIC_ID,
              name: "Metric",
              type: "metric",
              dataset_query: createMockStructuredDatasetQuery({
                database: SAMPLE_DB_ID,
                query: {
                  "source-table": ORDERS_ID,
                  aggregation: [["sum", ["field", ORDERS.TOTAL, {}]]],
                },
              }),
            }),
          ],
        }),
      ],
    }),
  ],
});

function ref(id: number, options?: ReferenceOptions): LocalFieldReference {
  const field = metadata.field(id);
  if (!field) {
    return ["field", id, null];
  }

  const opts = { ...options };
  if (field.base_type) {
    opts["base-type"] = field.base_type;
  }
  return ["field", id, opts];
}

export const id = ref(ORDERS.ID);
export const created = ref(ORDERS.CREATED_AT);
export const total = ref(ORDERS.TOTAL);
export const subtotal = ref(ORDERS.SUBTOTAL);
export const tax = ref(ORDERS.TAX);
export const userId = ref(ORDERS.USER_ID);
export const userName = ref(PEOPLE.NAME, { "source-field": ORDERS.USER_ID });
export const price = ref(PRODUCTS.PRICE, { "source-field": ORDERS.PRODUCT_ID });
export const ean = ref(PRODUCTS.EAN, { "source-field": ORDERS.PRODUCT_ID });
export const name = ref(PEOPLE.NAME, { "source-field": ORDERS.USER_ID });
export const category = ref(PRODUCTS.CATEGORY, {
  "source-field": ORDERS.PRODUCT_ID,
});
export const email = ref(PEOPLE.EMAIL, { "source-field": ORDERS.USER_ID });
export const bool = ["expression", "bool", { "base-type": "type/Boolean" }];
export const segment = checkNotNull(
  metadata.segment(SEGMENT_ID),
).filterClause();
export const metric: MetricAgg = ["metric", METRIC_ID];

export const query = createQueryWithClauses({
  query: createQuery({ metadata }),
  expressions: [
    {
      name: "foo",
      operator: "+",
      args: [1, 2],
    },
    {
      name: "bool",
      operator: "=",
      args: [1, 1],
    },
    {
      name: "name with [brackets]",
      operator: "+",
      args: [1, 2],
    },
    {
      name: "name with \\ slash",
      operator: "+",
      args: [1, 2],
    },
  ],
});
const stageIndex = -1;

// shared test cases used in compile, formatter, and syntax tests:
//
//  [expression, mbql, description]
//
// (if mbql is `null` then expression should NOT compile)
//
const expression: TestCase[] = [
  ["1", 1, "number literal"],
  ["1 + -1", ["+", 1, -1], "negative number literal"],
  ["1 * 2 + 3", ["+", ["*", 1, 2], 3], "operators ordered by precedence"],
  ["1 + 2 * 3", ["+", 1, ["*", 2, 3]], "operators not ordered by precedence"],
  [
    "1 + 2 + 3 * 4 * 5 + 6",
    ["+", 1, 2, ["*", 3, 4, 5], 6],
    "runs of multiple of the same operator",
  ],
  [
    "1 * (2 + 3)",
    ["*", 1, ["+", 2, 3]],
    "parenthesis overriding operator precedence",
  ],
  [
    "(1 + 2) * 3",
    ["*", ["+", 1, 2], 3],
    "parenthesis overriding operator precedence",
  ],
  ['"hello world"', ["value", "hello world"], "string literal"],
  ["[Subtotal]", subtotal, "field name"],
  ["[Tax] + [Total]", ["+", tax, total], "adding two fields"],
  ["1 + [Subtotal]", ["+", 1, subtotal], "adding literal and field"],
  ["[User ID]", userId, "field name with spaces"],
  ["[foo]", ["expression", "foo"], "named expression"],
  ["[User → Name]", userName, "foriegn key"],
  ["now", ["now"], "function with zero arguments"],
  ["trim([User → Name])", ["trim", userName], "function with one argument"],
  [
    'coalesce([User → Name], ",")',
    ["coalesce", userName, ","],
    "function with two arguments",
  ],
  [
    'concat("http://mysite.com/user/", [User ID], "/")',
    ["concat", "http://mysite.com/user/", userId, "/"],
    "function with 3 arguments",
  ],
  ["text([User ID])", ["text", userId], "text function"],
  ['integer("10")', ["integer", "10"], "integer function"],
  ['date("2025-03-20")', ["date", "2025-03-20"], "date function"],
  [
    'case([Total] > 10, "GOOD", [Total] < 5, "BAD", "OK")',
    [
      "case",
      [
        [[">", total, 10], "GOOD"],
        [["<", total, 5], "BAD"],
      ],
      { default: "OK" },
    ],
    "case statement with default",
  ],
  [
    'if([Total] > 10, "GOOD", [Total] < 5, "BAD", "OK")',
    [
      "if",
      [
        [[">", total, 10], "GOOD"],
        [["<", total, 5], "BAD"],
      ],
      { default: "OK" },
    ],
    "if statement with default",
  ],
  // should not compile:
  // ["\"Hell\" + 1", null, "adding a string to a number"],

  [
    "Sum([Total]) / Sum([Product → Price]) * Average([Tax])",
    ["*", ["/", ["sum", total], ["sum", price]], ["avg", tax]],
    "should handle priority for multiply and division without parenthesis",
  ],

  [
    "Sum([Total]) / (Sum([Product → Price]) * Average([Tax]))",
    ["/", ["sum", total], ["*", ["sum", price], ["avg", tax]]],
    "should handle priority for multiply and division with parenthesis",
  ],

  [
    "Sum([Total]) - Sum([Product → Price]) + Average([Tax])",
    ["+", ["-", ["sum", total], ["sum", price]], ["avg", tax]],
    "should handle priority for addition and subtraction without parenthesis",
  ],

  [
    "Sum([Total]) - (Sum([Product → Price]) + Average([Tax]))",
    ["-", ["sum", total], ["+", ["sum", price], ["avg", tax]]],
    "should handle priority for addition and subtraction with parenthesis",
  ],

  [
    'contains([Product → Ean], "A", "B")',
    ["contains", {}, ean, "A", "B"],
    "should handle contains with multiple arguments and empty options",
  ],

  [
    'contains([Product → Ean], "A", "B", "case-insensitive")',
    ["contains", { "case-sensitive": false }, ean, "A", "B"],
    "should handle contains with multiple arguments and non-empty options",
  ],

  [
    'doesNotContain([User → Name], "A", "B", "C")',
    ["does-not-contain", {}, name, "A", "B", "C"],
    "should handle doesNotContain with multiple arguments and empty options",
  ],

  [
    'doesNotContain([User → Name], "A", "B", "C", "case-insensitive")',
    ["does-not-contain", { "case-sensitive": false }, name, "A", "B", "C"],
    "should handle doesNotContain with multiple arguments and empty options",
  ],

  [
    'startsWith([Product → Category], "A", "B")',
    ["starts-with", {}, category, "A", "B"],
    "should handle startsWith with multiple arguments and empty options",
  ],

  [
    'startsWith([Product → Category], "A", "B", "case-insensitive")',
    ["starts-with", { "case-sensitive": false }, category, "A", "B"],
    "should handle startsWith with multiple arguments and non-empty options",
  ],

  [
    'endsWith([User → Email], "A", "B", "C", "D")',
    ["ends-with", {}, email, "A", "B", "C", "D"],
    "should handle endsWith with multiple arguments and empty options",
  ],

  [
    'endsWith([User → Email], "A", "B", "C", "D", "case-insensitive")',
    ["ends-with", { "case-sensitive": false }, email, "A", "B", "C", "D"],
    "should handle endsWith with multiple arguments and non-empty options",
  ],
  [`10`, ["value", 10], "should handle number literals"],
  [`"abc"`, ["value", "abc"], "should handle string literals"],
  [`False`, ["value", false], 'should handle "false" boolean literal'],
  [`True`, ["value", true], 'should handle "true" boolean literal'],
];

const aggregation: TestCase[] = [
  ["Count", ["count"], "aggregation with no arguments"],
  ["Sum([Total])", ["sum", total], "aggregation with one argument"],
  ["1 - Count", ["-", 1, ["count"]], "aggregation with math outside"],
  [
    "Sum([Total] * 2)",
    ["sum", ["*", total, 2]],
    "aggregation with math inside",
  ],
  [
    "1 - Sum([Total] * 2) / Count",
    ["-", 1, ["/", ["sum", ["*", total, 2]], ["count"]]],
    "aggregation with math inside and outside",
  ],
  ["Share([Total] > 50)", ["share", [">", total, 50]], "share aggregation"],
  [
    "CountIf([Total] > 50)",
    ["count-where", [">", total, 50]],
    "count-where aggregation",
  ],
  [
    "SumIf([Total], [Total] > 50)",
    ["sum-where", total, [">", total, 50]],
    "sum-where aggregation",
  ],
  [
    "Average(coalesce([Total], [Tax]))",
    ["avg", ["coalesce", total, tax]],
    "coalesce inside an aggregation",
  ],
  // This used to work but we no longer seem to support direct field references
  // by field id.
  // [
  //   "CountIf(49 <= [Total])",
  //   ["count-where", ["<=", 49, total]],
  //   "count-where aggregation with left-hand-side literal",
  // ],
  [
    "CountIf([Total] + [Tax] < 52)",
    ["count-where", ["<", ["+", total, tax], 52]],
    "count-where aggregation with an arithmetic operation",
  ],
  // should not compile:
  ["Count([Total])", undefined, "invalid count arguments"],
  ["SumIf([Total] > 50, [Total])", undefined, "invalid sum-where arguments"],
  ["Count + Share((", undefined, "invalid share"],
  [
    "DistinctIf([User ID], [Total] > 50)",
    ["distinct-where", userId, [">", total, 50]],
    "distinct-where aggregation",
  ],
  ["[Metric]", metric, "Metric reference"],
];

const filter: TestCase[] = [
  ["[Total] < 10", ["<", total, 10], "filter operator"],
  [
    "floor([Total]) < 10",
    ["<", ["floor", total], 10],
    "filter operator with number function",
  ],
  ["between([Subtotal], 1, 2)", ["between", subtotal, 1, 2], "filter function"],
  [
    "between([Subtotal] - [Tax], 1, 2)",
    ["between", ["-", subtotal, tax], 1, 2],
    "filter function with math",
  ],
  ["NOT [Total] < 10", ["not", ["<", total, 10]], "filter with not"],
  [
    "[Total] < 10 AND [Tax] >= 1",
    ["and", ["<", total, 10], [">=", tax, 1]],
    "filter with AND",
  ],
  [
    'interval([Created At], -1, "month")',
    ["time-interval", created, -1, "month"],
    "time interval filter",
  ],
  [
    'intervalStartingFrom([Created At], -1, "month", -2, "years")',
    ["relative-time-interval", created, -1, "month", -2, "years"],
    "relative time interval filter",
  ],
  ["[Expensive Things]", segment, "segment"],
  ["NOT [Expensive Things]", ["not", segment], "not segment"],
  ["[Expensive Things]", ["not", ["not", segment]], "more segment unary"],
  [
    "NOT between([Subtotal], 3, 14) OR [Expensive Things]",
    ["or", ["not", ["between", subtotal, 3, 14]], segment],
    "filter function with OR",
  ],
  [
    'doesNotContain([User → Name], "John")',
    ["does-not-contain", userName, "John"],
    "not contains",
  ],
  ["notNull([Tax])", ["not-null", tax], "not null"],
  ["notEmpty([Total])", ["not-empty", total], "not empty"],
  ["NOT isNull([Tax])", ["not", ["is-null", tax]], "not is null"],
  ["NOT isEmpty([Tax])", ["not", ["is-empty", tax]], "not is empty"],
  [
    'NOT doesNotContain([Tax], "John")',
    ["not", ["does-not-contain", tax, "John"]],
    "not does not contain",
  ],
];

type TestCase = [string, Expression | undefined, string];

export const dataForFormatting: [string, TestCase[], FormatClauseOptions][] = [
  ["expression", expression, { query, stageIndex }],
  ["aggregation", aggregation, { query, stageIndex }],
  ["filter", filter, { query, stageIndex }],
] as const;

export const sharedMetadata = metadata;
