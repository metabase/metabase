import {
  ORDERS,
  PRODUCTS,
  makeStructuredQuery,
} from "__support__/sample_dataset_fixture";

const EXAMPLE_JOIN = {
  alias: "join0",
  "source-table": PRODUCTS.id,
  condition: [
    "=",
    ["field-id", ORDERS.PRODUCT_ID.id],
    ["joined-field", "join0", ["field-id", PRODUCTS.ID.id]],
  ],
};

describe("StructuredQuery nesting", () => {
  describe("parentDimension", () => {
    it("should return the correct dimension", () => {
      const j = makeStructuredQuery({
        "source-table": ORDERS.id,
        joins: [EXAMPLE_JOIN],
      }).joins()[0];
      expect(j.parentDimension().mbql()).toEqual([
        "field-id",
        ORDERS.PRODUCT_ID.id,
      ]);
    });
  });
  describe("joinDimension", () => {
    it("should return the correct dimension", () => {
      const j = makeStructuredQuery({
        "source-table": ORDERS.id,
        joins: [EXAMPLE_JOIN],
      }).joins()[0];
      expect(j.joinDimension().mbql()).toEqual([
        "joined-field",
        "join0",
        ["field-id", PRODUCTS.ID.id],
      ]);
    });
  });
  describe("parentDimensionOptions", () => {
    it("should return correct dimensions for a source-table", () => {
      const j = makeStructuredQuery({
        "source-table": ORDERS.id,
        joins: [{ alias: "join0" }],
      }).joins()[0];
      const options = j.parentDimensionOptions();
      expect(options.count).toBe(7);
      expect(options.dimensions[0].mbql()).toEqual(["field-id", 1]);
    });
    it("should return correct dimensions for a source-query", () => {
      const j = makeStructuredQuery({
        "source-query": { "source-table": ORDERS.id },
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
        "source-query": { "source-table": ORDERS.id },
        joins: [{ alias: "join0", "source-table": ORDERS.id }],
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
        "source-query": { "source-table": ORDERS.id },
        joins: [
          {
            alias: "join0",
            "source-query": { "source-table": ORDERS.id },
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
        "source-table": PRODUCTS.id,
        joins: [
          {
            alias: "join0",
            "source-table": ORDERS.id,
          },
        ],
      });
      const options = q.dimensionOptions();
      expect(options.count).toEqual(15);
    });
  });
});
