import { ORDERS, PRODUCTS, REVIEWS } from "__support__/sample_dataset_fixture";

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
          ["field", 3, null],
          ["field", 24, { "join-alias": "x" }],
        ],
        "source-table": 3,
      });
    });
  });
  describe("setDefaultAlias", () => {
    it("should set default alias to be table + field name and update join condition", () => {
      const q = ORDERS.query().join({
        alias: "x",
        condition: [
          "=",
          ["field", ORDERS.PRODUCT_ID.id, null],
          ["field", REVIEWS.PRODUCT_ID.id, { "join-alias": "x" }],
        ],
        "source-table": REVIEWS.id,
      });
      const j = q
        .joins()[0]
        .setDefaultCondition()
        .setDefaultAlias();
      expect(j).toEqual({
        alias: "Reviews - Product",
        condition: [
          "=",
          ["field", ORDERS.PRODUCT_ID.id, null],
          [
            "field",
            REVIEWS.PRODUCT_ID.id,
            { "join-alias": "Reviews - Product" },
          ],
        ],
        "source-table": REVIEWS.id,
      });
    });
    it("should set default alias to be table name only if it is similar to field name", () => {
      const q = ORDERS.query().join({
        alias: "x",
        "source-table": PRODUCTS.id,
      });
      const j = q
        .joins()[0]
        .setDefaultCondition()
        .setDefaultAlias();
      expect(j).toEqual({
        alias: "Products",
        condition: [
          "=",
          ["field", ORDERS.PRODUCT_ID.id, null],
          ["field", PRODUCTS.ID.id, { "join-alias": "Products" }],
        ],
        "source-table": PRODUCTS.id,
      });
    });
  });
});
