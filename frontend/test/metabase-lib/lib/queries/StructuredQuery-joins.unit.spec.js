import { createMockMetadata } from "__support__/metadata";
import {
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
} from "metabase-types/api/mocks/presets";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const ordersTable = metadata.table(ORDERS_ID);
const productsTable = metadata.table(PRODUCTS_ID);

const EXAMPLE_JOIN = {
  alias: "join0",
  "source-table": PRODUCTS_ID,
  condition: [
    "=",
    ["field", ORDERS.PRODUCT_ID, null],
    ["field", PRODUCTS.ID, { "join-alias": "join0" }],
  ],
};

describe("StructuredQuery nesting", () => {
  describe("parentDimension", () => {
    it("should return the correct dimension", () => {
      const j = ordersTable.query().join(EXAMPLE_JOIN).joins()[0];
      expect(j.parentDimensions()[0].mbql()).toEqual([
        "field",
        ORDERS.PRODUCT_ID,
        null,
      ]);
    });
  });
  describe("joinDimension", () => {
    it("should return the correct dimension", () => {
      const j = ordersTable.query().join(EXAMPLE_JOIN).joins()[0];
      expect(j.joinDimensions()[0].mbql()).toEqual([
        "field",
        PRODUCTS.ID,
        { "join-alias": "join0" },
      ]);
    });
  });
  describe("parentDimensionOptions", () => {
    it("should return correct dimensions for a source-table", () => {
      const j = ordersTable.query().join({ alias: "join0" }).joins()[0];
      const options = j.parentDimensionOptions();
      expect(options.count).toBe(9);
      expect(options.dimensions[0].mbql()).toEqual(["field", ORDERS.ID, null]);
    });
    it("should return correct dimensions for a source-query", () => {
      const j = ordersTable.query().nest().join({ alias: "join0" }).joins()[0];
      const options = j.parentDimensionOptions();
      expect(options.count).toBe(9);
      expect(options.dimensions[0].mbql()).toEqual([
        "field",
        "ID",
        { "base-type": "type/BigInteger" },
      ]);
    });
  });
  describe("joinDimensionOptions", () => {
    it("should return correct dimensions with a source-table", () => {
      const j = ordersTable
        .query()
        .join({ alias: "join0", "source-table": ORDERS_ID })
        .joins()[0];
      const options = j.joinDimensionOptions();
      expect(options.count).toBe(9);
      expect(options.dimensions[0].mbql()).toEqual([
        "field",
        ORDERS.ID,
        { "join-alias": "join0" },
      ]);
    });
    it("should return correct dimensions with a source-query", () => {
      const j = ordersTable
        .query()
        .join({
          alias: "join0",
          "source-query": { "source-table": ORDERS_ID },
        })
        .joins()[0];
      const options = j.joinDimensionOptions();
      expect(options.count).toBe(9);
      expect(options.dimensions[0].mbql()).toEqual([
        "field",
        ORDERS.ID,
        { "join-alias": "join0" },
      ]);
    });
  });
  describe("dimensionOptions", () => {
    it("should include joined table's fields", () => {
      const q = productsTable.query().join({
        alias: "join0",
        "source-table": ORDERS_ID,
      });
      const options = q.dimensionOptions();
      expect(options.count).toEqual(17);
    });
  });
});
