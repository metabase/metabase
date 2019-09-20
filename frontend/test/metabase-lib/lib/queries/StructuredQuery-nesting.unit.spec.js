import {
  ORDERS_TABLE_ID,
  ORDERS_TOTAL_FIELD_ID,
  ORDERS_PRODUCT_FK_FIELD_ID,
  makeStructuredQuery,
} from "__support__/sample_dataset_fixture";

describe("StructuredQuery nesting", () => {
  describe("nest", () => {
    it("", () => {
      const q = makeStructuredQuery({ "source-table": ORDERS_TABLE_ID });
      expect(q.query()).toEqual({ "source-table": ORDERS_TABLE_ID });
      expect(q.nest().query()).toEqual({
        "source-query": { "source-table": ORDERS_TABLE_ID },
      });
    });

    it("should be able to modify the outer question", () => {
      const q = makeStructuredQuery({ "source-table": ORDERS_TABLE_ID });
      expect(
        q
          .nest()
          .addFilter(["=", ["field-id", ORDERS_TOTAL_FIELD_ID], 42])
          .query(),
      ).toEqual({
        "source-query": { "source-table": ORDERS_TABLE_ID },
        filter: ["=", ["field-id", ORDERS_TOTAL_FIELD_ID], 42],
      });
    });

    it("should be able to modify the source question", () => {
      const q = makeStructuredQuery({ "source-table": ORDERS_TABLE_ID });
      expect(
        q
          .nest()
          .sourceQuery()
          .addFilter(["=", ["field-id", ORDERS_TOTAL_FIELD_ID], 42])
          .parentQuery()
          .query(),
      ).toEqual({
        "source-query": {
          "source-table": ORDERS_TABLE_ID,
          filter: ["=", ["field-id", ORDERS_TOTAL_FIELD_ID], 42],
        },
      });
    });

    it("should return a table with correct dimensions", () => {
      const q = makeStructuredQuery({
        "source-table": ORDERS_TABLE_ID,
        aggregation: [["count"]],
        breakout: [["field-id", ORDERS_PRODUCT_FK_FIELD_ID]],
      });
      expect(
        q
          .nest()
          .filterFieldOptions()
          .dimensions.map(d => d.mbql()),
      ).toEqual([
        ["field-literal", "PRODUCT_ID", "type/Integer"],
        ["field-literal", "count", "type/Integer"],
      ]);
    });
  });

  describe("topLevelFilters", () => {
    it("should return filters for the last two stages", () => {
      const q = makeStructuredQuery({
        "source-query": {
          "source-table": ORDERS_TABLE_ID,
          aggregation: [["count"]],
          filter: ["=", ["field-id", ORDERS_PRODUCT_FK_FIELD_ID], 1],
        },
        filter: ["=", ["field-literal", "count", "type/Integer"], 2],
      });
      const filters = q.topLevelFilters();
      expect(filters).toHaveLength(2);
      expect(filters[0]).toEqual([
        "=",
        ["field-id", ORDERS_PRODUCT_FK_FIELD_ID],
        1,
      ]);
      expect(filters[1]).toEqual([
        "=",
        ["field-literal", "count", "type/Integer"],
        2,
      ]);
    });
  });

  describe("topLevelQuery", () => {
    it("should return the query if it's summarized", () => {
      const q = makeStructuredQuery({ "source-table": ORDERS_TABLE_ID });
      expect(q.topLevelQuery().query()).toEqual({
        "source-table": ORDERS_TABLE_ID,
      });
    });
    it("should return the query if it's not summarized", () => {
      const q = makeStructuredQuery({
        "source-table": ORDERS_TABLE_ID,
        aggregation: [["count"]],
      });
      expect(q.topLevelQuery().query()).toEqual({
        "source-table": ORDERS_TABLE_ID,
        aggregation: [["count"]],
      });
    });
    it("should return last stage if none are summarized", () => {
      const q = makeStructuredQuery({
        "source-query": { "source-table": ORDERS_TABLE_ID },
      });
      expect(q.topLevelQuery().query()).toEqual({
        "source-query": { "source-table": ORDERS_TABLE_ID },
      });
    });
    it("should return last summarized stage if any is summarized", () => {
      const q = makeStructuredQuery({
        "source-query": {
          "source-table": ORDERS_TABLE_ID,
          aggregation: [["count"]],
        },
      });
      expect(q.topLevelQuery().query()).toEqual({
        "source-table": ORDERS_TABLE_ID,
        aggregation: [["count"]],
      });
    });
  });

  describe("topLevelDimension", () => {
    it("should return same dimension if not nested", () => {
      const q = makeStructuredQuery({
        "source-table": ORDERS_TABLE_ID,
      });
      const d = q.topLevelDimension(
        q.parseFieldReference(["field-id", ORDERS_TOTAL_FIELD_ID]),
      );
      expect(d.mbql()).toEqual(["field-id", ORDERS_TOTAL_FIELD_ID]);
    });
    it("should return underlying dimension for a nested query", () => {
      const q = makeStructuredQuery({
        "source-query": {
          "source-table": ORDERS_TABLE_ID,
          aggregation: [["count"]],
          breakout: [["field-id", ORDERS_TOTAL_FIELD_ID]],
        },
      });
      const d = q.topLevelDimension(
        q.parseFieldReference(["field-literal", "TOTAL", "type/Float"]),
      );
      expect(d.mbql()).toEqual(["field-id", ORDERS_TOTAL_FIELD_ID]);
    });
  });
});
