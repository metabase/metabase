import { ORDERS, PEOPLE } from "__support__/sample_dataset_fixture";

const created = ORDERS.CREATED_AT.dimension().mbql();
const total = ORDERS.TOTAL.dimension().mbql();
const subtotal = ORDERS.SUBTOTAL.dimension().mbql();
const tax = ORDERS.TAX.dimension().mbql();
const userId = ORDERS.USER_ID.dimension().mbql();
const userName = ORDERS.USER_ID.foreign(PEOPLE.NAME).mbql();

const metric = ORDERS.metrics[0].aggregationClause();
const segment = ORDERS.segments[0].filterClause();

const query = ORDERS.query().addExpression("foo", 42);

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
  ["trim([User → Name])", ["trim", userName], "function with one argument"],
  [
    'trim([User → Name], ",")',
    ["trim", userName, ","],
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
      [[[">", total, 10], "GOOD"], [["<", total, 5], "BAD"]],
      { default: "OK" },
    ],
    "case statement with default",
  ],
  // should not compile:
  // ["\"Hell\" + 1", null, "adding a string to a number"],
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
  ["[Total Order Value]", metric, "metric"],
  ["[Total Order Value] * 2", ["*", metric, 2], "metric with math"],
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
  // should not compile:
  ["Sum(Count)", undefined, "aggregation nested inside another aggregation"],
  ["Count([Total])", undefined, "invalid count arguments"],
  ["SumIf([Total] > 50, [Total])", undefined, "invalid sum-where arguments"],
  ["Count + Share((", undefined, "invalid share"],
];

const filter = [
  ["[Total] < 10", ["<", total, 10], "filter operator"],
  // [
  //   "floor([Total]) < 10",
  //   ["<", ["floor", total], 10],
  //   "filter operator with number function",
  // ],
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
];

export default [
  ["expression", expression, { startRule: "expression", query }],
  ["aggregation", aggregation, { startRule: "aggregation", query }],
  ["filter", filter, { startRule: "boolean", query }],
];
