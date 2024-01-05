import { createMockMetadata } from "__support__/metadata";
import {
  createSampleDatabase,
  ORDERS_ID,
  PRODUCTS_ID,
} from "metabase-types/api/mocks/presets";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const productsTable = metadata.table(PRODUCTS_ID);

describe("StructuredQuery nesting", () => {
  describe("dimensionOptions", () => {
    it("should include joined table's fields", () => {
      const q = productsTable.legacyQuery().join({
        alias: "join0",
        "source-table": ORDERS_ID,
      });
      const options = q.dimensionOptions();
      expect(options.count).toEqual(17);
    });
  });
});
