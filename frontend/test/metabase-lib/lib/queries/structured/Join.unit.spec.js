import { ORDERS, PRODUCTS } from "__support__/sample_dataset_fixture";

import Join from "metabase-lib/lib/queries/structured/Join";

describe("Join", () => {
  describe("setJoinSourceTableId", () => {
    it("should pick an alias based on the source table name by default", () => {
      const q = ORDERS.query();
      const j = new Join({}, 0, q).setJoinSourceTableId(PRODUCTS.id);
      expect(j.alias).toEqual("Products");
    });
    it("should deduplicate aliases", () => {
      const q = ORDERS.query().join({
        alias: "Products",
        "source-table": PRODUCTS.id,
      });
      const j = new Join({}, 1, q).setJoinSourceTableId(PRODUCTS.id);
      expect(j.alias).toEqual("Products_2");
    });
  });
  describe("setDefaultCondition", () => {
    it("should set default condition to be fk relationship", () => {
      const q = ORDERS.query().join({
        alias: "x",
        "source-table": PRODUCTS.id,
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
      const q = ORDERS.query().join({
        alias: "x",
        "source-table": PRODUCTS.id,
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
