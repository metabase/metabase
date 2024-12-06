import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/lib/types";
import { createQuery, createQueryWithClauses } from "metabase-lib/test-helpers";
import { createMockSegment } from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PEOPLE,
  PRODUCTS,
  createOrdersTable,
  createPeopleTable,
  createProductsTable,
  createReviewsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

const SEGMENT_ID = 1;

const metadata = createMockMetadata({
  databases: [
    createSampleDatabase({
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
        }),
      ],
    }),
  ],
});

const created = checkNotNull(metadata.field(ORDERS.CREATED_AT))
  .dimension()
  .mbql();
const total = checkNotNull(metadata.field(ORDERS.TOTAL)).dimension().mbql();
const subtotal = checkNotNull(metadata.field(ORDERS.SUBTOTAL))
  .dimension()
  .mbql();
const tax = checkNotNull(metadata.field(ORDERS.TAX)).dimension().mbql();
const userId = checkNotNull(metadata.field(ORDERS.USER_ID)).dimension().mbql();
const userName = checkNotNull(metadata.field(ORDERS.USER_ID))
  .foreign(metadata.field(PEOPLE.NAME))
  .mbql();

const segment = checkNotNull(metadata.segment(SEGMENT_ID)).filterClause();

const query = createQueryWithClauses({
  query: createQuery({ metadata }),
  expressions: [
    {
      name: "foo",
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
const expression = [
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
  ['"hello world"', "hello world", "string literal"],
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
  // should not compile:
  // ["\"Hell\" + 1", null, "adding a string to a number"],

  [
    "Sum([Total]) / Sum([Product → Price]) * Average([Tax])",
    [
      "*",
      [
        "/",
        ["sum", ["field", ORDERS.TOTAL, null]],
        [
          "sum",
          ["field", PRODUCTS.PRICE, { "source-field": ORDERS.PRODUCT_ID }],
        ],
      ],
      ["avg", ["field", ORDERS.TAX, null]],
    ],
    "should handle priority for multiply and division without parenthesis",
  ],

  [
    "Sum([Total]) / (Sum([Product → Price]) * Average([Tax]))",
    [
      "/",
      ["sum", ["field", ORDERS.TOTAL, null]],
      [
        "*",
        [
          "sum",
          ["field", PRODUCTS.PRICE, { "source-field": ORDERS.PRODUCT_ID }],
        ],
        ["avg", ["field", ORDERS.TAX, null]],
      ],
    ],
    "should handle priority for multiply and division with parenthesis",
  ],

  [
    "Sum([Total]) - Sum([Product → Price]) + Average([Tax])",
    [
      "+",
      [
        "-",
        ["sum", ["field", ORDERS.TOTAL, null]],
        [
          "sum",
          ["field", PRODUCTS.PRICE, { "source-field": ORDERS.PRODUCT_ID }],
        ],
      ],
      ["avg", ["field", ORDERS.TAX, null]],
    ],
    "should handle priority for addition and subtraction without parenthesis",
  ],

  [
    "Sum([Total]) - (Sum([Product → Price]) + Average([Tax]))",
    [
      "-",
      ["sum", ["field", ORDERS.TOTAL, null]],
      [
        "+",
        [
          "sum",
          ["field", PRODUCTS.PRICE, { "source-field": ORDERS.PRODUCT_ID }],
        ],
        ["avg", ["field", ORDERS.TAX, null]],
      ],
    ],
    "should handle priority for addition and subtraction with parenthesis",
  ],

  [
    'contains([Product → Ean], "A", "B")',
    [
      "contains",
      {},
      ["field", PRODUCTS.EAN, { "source-field": ORDERS.PRODUCT_ID }],
      "A",
      "B",
    ],
    "should handle contains with multiple arguments and empty options",
  ],

  [
    'contains([Product → Ean], "A", "B", "case-insensitive")',
    [
      "contains",
      { "case-sensitive": false },
      ["field", PRODUCTS.EAN, { "source-field": ORDERS.PRODUCT_ID }],
      "A",
      "B",
    ],
    "should handle contains with multiple arguments and non-empty options",
  ],

  [
    'doesNotContain([User → Name], "A", "B", "C")',
    [
      "does-not-contain",
      {},
      ["field", PEOPLE.NAME, { "source-field": ORDERS.USER_ID }],
      "A",
      "B",
      "C",
    ],
    "should handle doesNotContain with multiple arguments and empty options",
  ],

  [
    'doesNotContain([User → Name], "A", "B", "C", "case-insensitive")',
    [
      "does-not-contain",
      { "case-sensitive": false },
      ["field", PEOPLE.NAME, { "source-field": ORDERS.USER_ID }],
      "A",
      "B",
      "C",
    ],
    "should handle doesNotContain with multiple arguments and empty options",
  ],

  [
    'startsWith([Product → Category], "A", "B")',
    [
      "starts-with",
      {},
      ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
      "A",
      "B",
    ],
    "should handle startsWith with multiple arguments and empty options",
  ],

  [
    'startsWith([Product → Category], "A", "B", "case-insensitive")',
    [
      "starts-with",
      { "case-sensitive": false },
      ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
      "A",
      "B",
    ],
    "should handle startsWith with multiple arguments and non-empty options",
  ],

  [
    'endsWith([User → Email], "A", "B", "C", "D")',
    [
      "ends-with",
      {},
      ["field", PEOPLE.EMAIL, { "source-field": ORDERS.USER_ID }],
      "A",
      "B",
      "C",
      "D",
    ],
    "should handle endsWith with multiple arguments and empty options",
  ],

  [
    'endsWith([User → Email], "A", "B", "C", "D", "case-insensitive")',
    [
      "ends-with",
      { "case-sensitive": false },
      ["field", PEOPLE.EMAIL, { "source-field": ORDERS.USER_ID }],
      "A",
      "B",
      "C",
      "D",
    ],
    "should handle endsWith with multiple arguments and non-empty options",
  ],
];

const aggregation = [
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
  [
    "CountIf(49 <= [Total])",
    ["count-where", ["<=", 49, total]],
    "count-where aggregation with left-hand-side literal",
  ],
  [
    "CountIf([Total] + [Tax] < 52)",
    ["count-where", ["<", ["+", total, tax], 52]],
    "count-where aggregation with an arithmetic operation",
  ],
  // should not compile:
  ["Count([Total])", undefined, "invalid count arguments"],
  ["SumIf([Total] > 50, [Total])", undefined, "invalid sum-where arguments"],
  ["Count + Share((", undefined, "invalid share"],
];

const filter = [
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
  ["[Expensive Things]", segment, "segment"],
  ["NOT [Expensive Things]", ["not", segment], "not segment"],
  [
    "NOT NOT [Expensive Things]",
    ["not", ["not", segment]],
    "more segment unary",
  ],
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
  ["notnull([Tax])", ["not-null", tax], "not null"],
  ["notempty([Total])", ["not-empty", total], "not empty"],
];

export const dataForFormatting = [
  ["expression", expression, { startRule: "expression", query, stageIndex }],
  ["aggregation", aggregation, { startRule: "aggregation", query, stageIndex }],
  ["filter", filter, { startRule: "boolean", query, stageIndex }],
];

/**
 * @type {import("metabase-lib/v1/metadata/Table").default}
 */
export const ordersTable = metadata.table(ORDERS_ID);

/**
 * @type {import("metabase-lib/v1/metadata/Field").default}
 */
export const ordersTotalField = metadata.field(ORDERS.TOTAL);

export const sharedMetadata = metadata;
