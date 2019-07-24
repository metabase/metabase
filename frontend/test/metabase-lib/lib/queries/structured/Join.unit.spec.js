import {
  ORDERS_TABLE_ID,
  PRODUCT_TABLE_ID,
  makeStructuredQuery,
} from "__support__/sample_dataset_fixture";

import Join from "metabase-lib/lib/queries/structured/Join";

describe("Join", () => {
  describe("setJoinSourceTableId", () => {
    it("should pick an alias based on the source table name", () => {
      const q = makeStructuredQuery({
        "source-table": ORDERS_TABLE_ID,
      });
      const j = new Join({}, 0, q).setJoinSourceTableId(PRODUCT_TABLE_ID);
      expect(j.alias).toEqual("PRODUCTS");
    });
    it("should deduplicate aliases", () => {
      const q = makeStructuredQuery({
        "source-table": ORDERS_TABLE_ID,
        joins: [{ alias: "PRODUCTS", "source-table": PRODUCT_TABLE_ID }],
      });
      const j = new Join({}, 1, q).setJoinSourceTableId(PRODUCT_TABLE_ID);
      expect(j.alias).toEqual("PRODUCTS_2");
    });
    it("should not pick source table name as alias", () => {
      const q = makeStructuredQuery({
        "source-table": ORDERS_TABLE_ID,
      });
      const j = new Join({}, 0, q).setJoinSourceTableId(ORDERS_TABLE_ID);
      expect(j.alias).toEqual("ORDERS_2");
    });
  });
});
