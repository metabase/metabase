import {
  ORDERS_TABLE_ID,
  PRODUCT_TABLE_ID,
  makeStructuredQuery,
} from "__support__/sample_dataset_fixture";

import Join from "metabase-lib/lib/queries/structured/Join";

describe("Join", () => {
  describe("setJoinSourceTableId", () => {
    it("should pick an alias based on the source table name by default", () => {
      const q = makeStructuredQuery({
        "source-table": ORDERS_TABLE_ID,
      });
      const j = new Join({}, 0, q).setJoinSourceTableId(PRODUCT_TABLE_ID);
      expect(j.alias).toEqual("Products");
    });
    it("should deduplicate aliases", () => {
      const q = makeStructuredQuery({
        "source-table": ORDERS_TABLE_ID,
        joins: [{ alias: "Products", "source-table": PRODUCT_TABLE_ID }],
      });
      const j = new Join({}, 1, q).setJoinSourceTableId(PRODUCT_TABLE_ID);
      expect(j.alias).toEqual("Products_2");
    });
  });
  describe("setDefaultCondition", () => {
    it("should set default condition to be fk relationship", () => {
      const q = makeStructuredQuery({
        "source-table": ORDERS_TABLE_ID,
        joins: [{ alias: "x", "source-table": PRODUCT_TABLE_ID }],
      });
      const j = q.joins()[0].setDefaultCondition();
      expect(j).toEqual({
        alias: "x",
        condition: [
          "=",
          ["field-id", 3],
          ["joined-field", "x", ["field-id", 24]],
        ],
        "source-table": 3,
      });
    });
  });
  describe("setDefaultAlias", () => {
    it("should set default alias to be fk field name and update join condition", () => {
      const q = makeStructuredQuery({
        "source-table": ORDERS_TABLE_ID,
        joins: [{ alias: "x", "source-table": PRODUCT_TABLE_ID }],
      });
      const j = q
        .joins()[0]
        .setDefaultCondition()
        .setDefaultAlias();
      expect(j).toEqual({
        alias: "Product",
        condition: [
          "=",
          ["field-id", 3],
          ["joined-field", "Product", ["field-id", 24]],
        ],
        "source-table": 3,
      });
    });
  });
});
