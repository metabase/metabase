import { ORDERS } from "__support__/sample_dataset_fixture";

describe("StructuredQuery", () => {
  describe("hasExpressions", () => {
    it("should return false for queries without expressions", () => {
      const q = ORDERS.query();
      expect(q.hasExpressions()).toBe(false);
    });
    it("should return true for queries with expressions", () => {
      const q = ORDERS.query().addExpression("double_total", [
        "*",
        ["field-id", ORDERS.TOTAL.id],
        2,
      ]);
      expect(q.hasExpressions()).toBe(true);
    });
  });
});
