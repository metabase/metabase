import { ORDERS, SAMPLE_DATASET } from "__support__/sample_dataset_fixture";
import Question from "metabase-lib/lib/Question";

const TEST_EXPRESSION = ["*", ["field", ORDERS.TOTAL.id, null], 2];
const TEST_EXPRESSION_2 = [
  "-",
  ["field", ORDERS.TOTAL.id, null],
  ["field", ORDERS.SUBTOTAL.id, null],
];

function getQuery({ expressions } = {}) {
  const question = new Question({
    dataset_query: {
      type: "query",
      database: SAMPLE_DATASET.id,
      query: {
        "source-table": ORDERS.id,
        expressions: expressions,
      },
    },
  });
  return question.query();
}

describe("StructuredQuery", () => {
  describe("expressions", () => {
    it("should return empty object when there are no expressions", () => {
      expect(getQuery().expressions()).toEqual({});
    });

    it("should return expressions object", () => {
      const query = getQuery({
        expressions: {
          double_total: TEST_EXPRESSION,
          diff: TEST_EXPRESSION_2,
        },
      });

      expect(query.expressions()).toEqual({
        double_total: TEST_EXPRESSION,
        diff: TEST_EXPRESSION_2,
      });
    });
  });

  describe("hasExpressions", () => {
    it("should return false for queries without expressions", () => {
      const query = getQuery();
      expect(query.hasExpressions()).toBe(false);
    });

    it("should return true for queries with expressions", () => {
      const query = getQuery({
        expressions: {
          double_total: TEST_EXPRESSION,
        },
      });
      expect(query.hasExpressions()).toBe(true);
    });
  });

  describe("addExpression", () => {
    it("should add new expressions correctly", () => {
      let query = getQuery();

      query = query.addExpression("double_total", TEST_EXPRESSION);

      expect(query.expressions()).toEqual({
        double_total: TEST_EXPRESSION,
      });
    });

    it("should append indexes to duplicate names", () => {
      let query = getQuery({
        expressions: { double_total: TEST_EXPRESSION },
      });

      query = query
        .addExpression("double_total", TEST_EXPRESSION)
        .addExpression("double_total", TEST_EXPRESSION);

      expect(query.expressions()).toEqual({
        double_total: TEST_EXPRESSION,
        "double_total (1)": TEST_EXPRESSION,
        "double_total (2)": TEST_EXPRESSION,
      });
    });

    it("should detect duplicate names in case-sensitive way", () => {
      let query = getQuery({
        expressions: { double_total: TEST_EXPRESSION },
      });

      query = query.addExpression("DOUBLE_TOTAL", TEST_EXPRESSION);

      expect(query.expressions()).toEqual({
        double_total: TEST_EXPRESSION,
        DOUBLE_TOTAL: TEST_EXPRESSION,
      });
    });

    it("should not append indexes when expression names are similar", () => {
      let query = getQuery({
        expressions: { double_total: TEST_EXPRESSION },
      });

      query = query
        .addExpression("double_total", TEST_EXPRESSION)
        .addExpression("double", TEST_EXPRESSION)
        .addExpression("total", TEST_EXPRESSION)
        .addExpression("double_total", TEST_EXPRESSION)
        .addExpression("foo_double_total", TEST_EXPRESSION)
        .addExpression("double_total_bar", TEST_EXPRESSION)
        .addExpression("double_total", TEST_EXPRESSION);

      expect(query.expressions()).toEqual({
        double_total: TEST_EXPRESSION,
        "double_total (1)": TEST_EXPRESSION,
        "double_total (2)": TEST_EXPRESSION,
        "double_total (3)": TEST_EXPRESSION,
        double: TEST_EXPRESSION,
        total: TEST_EXPRESSION,
        foo_double_total: TEST_EXPRESSION,
        double_total_bar: TEST_EXPRESSION,
      });
    });
  });

  describe("updateExpression", () => {
    it("should update expressions correctly", () => {
      let query = getQuery();

      query = query.addExpression("double_total", TEST_EXPRESSION);

      expect(query.expressions()).toEqual({
        double_total: TEST_EXPRESSION,
      });
    });
  });

  describe("removeExpression", () => {
    it("should remove expression correctly", () => {
      let query = getQuery({
        expressions: {
          double_total: TEST_EXPRESSION,
          diff: TEST_EXPRESSION_2,
        },
      });

      query = query.removeExpression("double_total");

      expect(query.expressions()).toEqual({
        diff: TEST_EXPRESSION_2,
      });
    });

    it("should do nothing when removing not existing expression", () => {
      let query = getQuery({
        expressions: {
          double_total: TEST_EXPRESSION,
        },
      });

      query = query.removeExpression("this_query_has_no_expression_like_that");

      expect(query.expressions()).toEqual({
        double_total: TEST_EXPRESSION,
      });
    });
  });

  describe("clearExpressions", () => {
    it("should remove all existing expressions", () => {
      let query = getQuery({
        expressions: {
          double_total: TEST_EXPRESSION,
          diff: TEST_EXPRESSION_2,
        },
      });

      query = query.clearExpressions();

      expect(query.expressions()).toEqual({});
    });

    it("should do nothing if there are no expressions", () => {
      let query = getQuery();
      query = query.clearExpressions();
      expect(query.expressions()).toEqual({});
    });
  });
});
