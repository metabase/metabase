import {
  ORDERS,
  makeStructuredQuery,
} from "__support__/sample_dataset_fixture";

describe("StructuredQuery", () => {
  describe("hasExpressions", () => {
    it("should return false for queries without expressions", () => {
      const q = makeStructuredQuery({ "source-table": ORDERS.id });
      expect(q.hasExpressions()).toBe(false);
    });
    it("should return true for queries with expressions", () => {
      const q = makeStructuredQuery({
        "source-table": ORDERS.id,
        expressions: {
          double_total: ["*", ["field-id", ORDERS.TOTAL.id], 2],
        },
      });
      expect(q.hasExpressions()).toBe(true);
    });
  });
});
