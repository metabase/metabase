import { ORDERS, PEOPLE } from "__support__/sample_dataset_fixture";

import { compile } from "metabase/lib/expressions/compile";
import { format } from "metabase/lib/expressions/formatter";

const total = ORDERS.TOTAL.dimension().mbql();
const subtotal = ORDERS.SUBTOTAL.dimension().mbql();
const tax = ORDERS.TAX.dimension().mbql();
const userName = ORDERS.USER_ID.foreign(PEOPLE.NAME).mbql();

const query = ORDERS.query().addExpression("foo", 42);

// NOTE: these tests ensure there's round-trip `compile` and `format` support for given MBQL without asserting the syntax itself

const AGGREGATION_TEST_CASES = [
  ["count"],
  ["sum", total],
  ["-", 1, ["/", ["sum", ["*", total, 2]], ["count"]]],
  //   ["metric", 1],
];

const EXPRESSION_TEST_CASES = [
  1,
  -1,
  subtotal,
  ["+", subtotal, tax],
  ["expression", "foo"],
  userName,
  ["concat", "http://mysite.com/user/", ORDERS.USER_ID.dimension().mbql()],
  //   ["case"],
];

const FILTER_TEST_CASES = [
  ["=", total, 1],
  ["or", ["=", total, 1], [">", subtotal, 2]],
];

describe("expressions", () => {
  describe("compile + format", () => {
    addTestCases(AGGREGATION_TEST_CASES, "aggregation");
    addTestCases(EXPRESSION_TEST_CASES, "expression");
    addTestCases(FILTER_TEST_CASES, "filter");
  });
});

function addTestCases(cases, startRule) {
  for (const mbql of cases) {
    it(`'${JSON.stringify(mbql)}' should compile and parse correctly`, () => {
      const formatted = format(mbql, { query });
      const compiled = compile(formatted, { startRule, query });
      expect(mbql).toEqual(compiled);
    });
  }
}
