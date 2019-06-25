import {
  ORDERS_TABLE_ID,
  ORDERS_PRODUCT_FK_FIELD_ID,
  PRODUCT_TABLE_ID,
  PRODUCT_PK_FIELD_ID,
  makeStructuredQuery,
} from "__support__/sample_dataset_fixture";

const EXAMPLE_JOIN = {
  alias: "join0",
  "source-table": PRODUCT_TABLE_ID,
  condition: [
    "=",
    ["field-id", ORDERS_PRODUCT_FK_FIELD_ID],
    ["joined-field", "join0", ["field-id", PRODUCT_PK_FIELD_ID]],
  ],
};

describe("StructuredQuery nesting", () => {
  describe("parentDimension", () => {
    it("should return the correct dimension", () => {
      const j = makeStructuredQuery({
        "source-table": ORDERS_TABLE_ID,
        joins: [EXAMPLE_JOIN],
      }).joins()[0];
      expect(j.parentDimension().mbql()).toEqual([
        "field-id",
        ORDERS_PRODUCT_FK_FIELD_ID,
      ]);
    });
  });
  describe("joinDimension", () => {
    it("should return the correct dimension", () => {
      const j = makeStructuredQuery({
        "source-table": ORDERS_TABLE_ID,
        joins: [EXAMPLE_JOIN],
      }).joins()[0];
      expect(j.joinDimension().mbql()).toEqual([
        "joined-field",
        "join0",
        ["field-id", PRODUCT_PK_FIELD_ID],
      ]);
    });
  });
  describe("parentDimensionOptions", () => {
    it("should return correct dimensions for a source-table", () => {
      const j = makeStructuredQuery({
        "source-table": ORDERS_TABLE_ID,
        joins: [{ alias: "join0" }],
      }).joins()[0];
      const options = j.parentDimensionOptions();
      expect(options.count).toBe(7);
      expect(options.dimensions[0].mbql()).toEqual(["field-id", 1]);
    });
    it("should return correct dimensions for a source-query", () => {
      const j = makeStructuredQuery({
        "source-query": { "source-table": ORDERS_TABLE_ID },
        joins: [{ alias: "join0" }],
      }).joins()[0];
      const options = j.parentDimensionOptions();
      expect(options.count).toBe(7);
      expect(options.dimensions[0].mbql()).toEqual([
        "field-literal",
        "ID",
        "type/BigInteger",
      ]);
    });
  });
  describe("joinDimensionOptions", () => {
    it("should return correct dimensions with a source-table", () => {
      const j = makeStructuredQuery({
        "source-query": { "source-table": ORDERS_TABLE_ID },
        joins: [{ alias: "join0", "source-table": ORDERS_TABLE_ID }],
      }).joins()[0];
      const options = j.joinDimensionOptions();
      expect(options.count).toBe(7);
      expect(options.dimensions[0].mbql()).toEqual([
        "joined-field",
        "join0",
        ["field-id", 1],
      ]);
    });
    it("should return correct dimensions with a source-query", () => {
      const j = makeStructuredQuery({
        "source-query": { "source-table": ORDERS_TABLE_ID },
        joins: [
          {
            alias: "join0",
            "source-query": { "source-table": ORDERS_TABLE_ID },
          },
        ],
      }).joins()[0];
      const options = j.joinDimensionOptions();
      expect(options.count).toBe(7);
      expect(options.dimensions[0].mbql()).toEqual([
        "joined-field",
        "join0",
        ["field-id", 1],
      ]);
    });
  });
  describe("dimensionOptions", () => {
    it("should include joined table's fields", () => {
      const q = makeStructuredQuery({
        "source-table": PRODUCT_TABLE_ID,
        joins: [
          {
            alias: "join0",
            "source-table": ORDERS_TABLE_ID,
          },
        ],
      });
      const options = q.dimensionOptions();
      expect(options.count).toEqual(15);
    });
  });
});
