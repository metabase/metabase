import { ORDERS } from "__support__/sample_dataset_fixture";

describe("StructuredQuery nesting", () => {
  describe("nest", () => {
    it("", () => {
      const q = ORDERS.query();
      expect(q.query()).toEqual({ "source-table": ORDERS.id });
      expect(q.nest().query()).toEqual({
        "source-query": { "source-table": ORDERS.id },
      });
    });

    it("should be able to modify the outer question", () => {
      const q = ORDERS.query();
      expect(
        q
          .nest()
          .filter(["=", ["field-id", ORDERS.TOTAL.id], 42])
          .query(),
      ).toEqual({
        "source-query": { "source-table": ORDERS.id },
        filter: ["=", ["field-id", ORDERS.TOTAL.id], 42],
      });
    });

    it("should be able to modify the source question", () => {
      const q = ORDERS.query();
      expect(
        q
          .nest()
          .sourceQuery()
          .filter(["=", ["field-id", ORDERS.TOTAL.id], 42])
          .parentQuery()
          .query(),
      ).toEqual({
        "source-query": {
          "source-table": ORDERS.id,
          filter: ["=", ["field-id", ORDERS.TOTAL.id], 42],
        },
      });
    });

    it("should return a table with correct dimensions", () => {
      const q = ORDERS.query()
        .aggregate(["count"])
        .breakout(["field-id", ORDERS.PRODUCT_ID.id]);
      expect(
        q
          .nest()
          .filterDimensionOptions()
          .dimensions.map(d => d.mbql()),
      ).toEqual([
        ["field-literal", "PRODUCT_ID", "type/Integer"],
        ["field-literal", "count", "type/Integer"],
      ]);
    });
  });

  describe("topLevelFilters", () => {
    it("should return filters for the last two stages", () => {
      const q = ORDERS.query()
        .aggregate(["count"])
        .filter(["=", ["field-id", ORDERS.PRODUCT_ID.id], 1])
        .nest()
        .filter(["=", ["field-literal", "count", "type/Integer"], 2]);
      const filters = q.topLevelFilters();
      expect(filters).toHaveLength(2);
      expect(filters[0]).toEqual(["=", ["field-id", ORDERS.PRODUCT_ID.id], 1]);
      expect(filters[1]).toEqual([
        "=",
        ["field-literal", "count", "type/Integer"],
        2,
      ]);
    });
  });

  describe("topLevelQuery", () => {
    it("should return the query if it's summarized", () => {
      const q = ORDERS.query();
      expect(q.topLevelQuery().query()).toEqual({
        "source-table": ORDERS.id,
      });
    });
    it("should return the query if it's not summarized", () => {
      const q = ORDERS.query().aggregate(["count"]);
      expect(q.topLevelQuery().query()).toEqual({
        "source-table": ORDERS.id,
        aggregation: [["count"]],
      });
    });
    it("should return last stage if none are summarized", () => {
      const q = ORDERS.query().nest();
      expect(q.topLevelQuery().query()).toEqual({
        "source-query": { "source-table": ORDERS.id },
      });
    });
    it("should return last summarized stage if any is summarized", () => {
      const q = ORDERS.query()
        .aggregate(["count"])
        .nest();
      expect(q.topLevelQuery().query()).toEqual({
        "source-table": ORDERS.id,
        aggregation: [["count"]],
      });
    });
  });

  describe("topLevelDimension", () => {
    it("should return same dimension if not nested", () => {
      const q = ORDERS.query();
      const d = q.topLevelDimension(
        q.parseFieldReference(["field-id", ORDERS.TOTAL.id]),
      );
      expect(d.mbql()).toEqual(["field-id", ORDERS.TOTAL.id]);
    });
    it("should return underlying dimension for a nested query", () => {
      const q = ORDERS.query()
        .aggregate(["count"])
        .breakout(["field-id", ORDERS.TOTAL.id])
        .nest();
      const d = q.topLevelDimension(
        q.parseFieldReference(["field-literal", "TOTAL", "type/Float"]),
      );
      expect(d.mbql()).toEqual(["field-id", ORDERS.TOTAL.id]);
    });
  });
});
