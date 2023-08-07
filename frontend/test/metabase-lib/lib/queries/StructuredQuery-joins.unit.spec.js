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
