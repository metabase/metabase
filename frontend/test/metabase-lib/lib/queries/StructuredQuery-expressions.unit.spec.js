import {
  ORDERS_TABLE_ID,
  ORDERS_TOTAL_FIELD_ID,
  makeStructuredQuery,
} from "__support__/sample_dataset_fixture";

describe("StructuredQuery", () => {
  describe("hasExpressions", () => {
    it("should return false for queries without expressions", () => {
      const q = makeStructuredQuery({ "source-table": ORDERS_TABLE_ID });
      expect(q.hasExpressions()).toBe(false);
    });
    it("should return true for queries with expressions", () => {
      const q = makeStructuredQuery({
        "source-table": ORDERS_TABLE_ID,
        expressions: {
          double_total: ["*", ["field-id", ORDERS_TOTAL_FIELD_ID], 2],
        },
      });
      expect(q.hasExpressions()).toBe(true);
    });
  });
});
