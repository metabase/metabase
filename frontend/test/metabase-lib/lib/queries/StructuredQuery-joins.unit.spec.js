import { ORDERS, PRODUCTS } from "__support__/sample_dataset_fixture";

const EXAMPLE_JOIN = {
  alias: "join0",
  "source-table": PRODUCTS.id,
  condition: [
    "=",
    ["field", ORDERS.PRODUCT_ID.id, null],
    ["field", PRODUCTS.ID.id, { "join-alias": "join0" }],
  ],
};

describe("StructuredQuery nesting", () => {
  describe("parentDimension", () => {
    it("should return the correct dimension", () => {
      const j = ORDERS.query()
        .join(EXAMPLE_JOIN)
        .joins()[0];
      expect(j.parentDimension().mbql()).toEqual([
        "field",
        ORDERS.PRODUCT_ID.id,
        null,
      ]);
    });
  });
  describe("joinDimension", () => {
    it("should return the correct dimension", () => {
      const j = ORDERS.query()
        .join(EXAMPLE_JOIN)
        .joins()[0];
      expect(j.joinDimension().mbql()).toEqual([
        "field",
        PRODUCTS.ID.id,
        { "join-alias": "join0" },
      ]);
    });
  });
  describe("parentDimensionOptions", () => {
    it("should return correct dimensions for a source-table", () => {
      const j = ORDERS.query()
        .join({ alias: "join0" })
        .joins()[0];
      const options = j.parentDimensionOptions();
      expect(options.count).toBe(7);
      expect(options.dimensions[0].mbql()).toEqual(["field", 1, null]);
    });
    it("should return correct dimensions for a source-query", () => {
      const j = ORDERS.query()
        .nest()
        .join({ alias: "join0" })
        .joins()[0];
      const options = j.parentDimensionOptions();
      expect(options.count).toBe(7);
      expect(options.dimensions[0].mbql()).toEqual([
        "field",
        "ID",
        { "base-type": "type/BigInteger" },
      ]);
    });
  });
  describe("joinDimensionOptions", () => {
    it("should return correct dimensions with a source-table", () => {
      const j = ORDERS.query()
        .join({ alias: "join0", "source-table": ORDERS.id })
        .joins()[0];
      const options = j.joinDimensionOptions();
      expect(options.count).toBe(7);
      expect(options.dimensions[0].mbql()).toEqual([
        "field",
        1,
        { "join-alias": "join0" },
      ]);
    });
    it("should return correct dimensions with a source-query", () => {
      const j = ORDERS.query()
        .join({
          alias: "join0",
          "source-query": { "source-table": ORDERS.id },
        })
        .joins()[0];
      const options = j.joinDimensionOptions();
      expect(options.count).toBe(7);
      expect(options.dimensions[0].mbql()).toEqual([
        "field",
        1,
        { "join-alias": "join0" },
      ]);
    });
  });
  describe("dimensionOptions", () => {
    it("should include joined table's fields", () => {
      const q = PRODUCTS.query().join({
        alias: "join0",
        "source-table": ORDERS.id,
      });
      const options = q.dimensionOptions();
      expect(options.count).toEqual(15);
    });
  });
});
