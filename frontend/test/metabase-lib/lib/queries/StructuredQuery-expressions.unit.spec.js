import { ORDERS } from "__support__/sample_dataset_fixture";

const TEST_EXPRESSION = ["*", ["field", ORDERS.TOTAL.id, null], 2];

describe("StructuredQuery", () => {
  describe("hasExpressions", () => {
    it("should return false for queries without expressions", () => {
      const q = ORDERS.query();
      expect(q.hasExpressions()).toBe(false);
    });

    it("should return true for queries with expressions", () => {
      const q = ORDERS.query().addExpression("double_total", TEST_EXPRESSION);
      expect(q.hasExpressions()).toBe(true);
    });
  });
});
