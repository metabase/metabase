import {
  generateQueryDescription,
  getOrderByDescription,
} from "metabase/lib/query/description";

import { ORDERS, PRODUCTS } from "__support__/sample_database_fixture";

const mockTableMetadata = {
  display_name: "Order",
  fields: [{ id: 1, display_name: "Total" }],
};

describe("metabase/lib/query/description", () => {
  describe("generateQueryDescription", () => {
    it("should work with multiple aggregations", () => {
      expect(
        generateQueryDescription(mockTableMetadata, {
          "source-table": ORDERS.id,
          aggregation: [["count"], ["sum", ["field", 1, null]]],
        }),
      ).toEqual("Orders, Count and Sum of Total");
    });

    it("should work with named aggregations", () => {
      expect(
        generateQueryDescription(mockTableMetadata, {
          "source-table": ORDERS.id,
          aggregation: [
            [
              "aggregation-options",
              ["sum", ["field", 1, null]],
              { "display-name": "Revenue" },
            ],
          ],
        }),
      ).toEqual("Orders, Revenue");
    });
  });

  describe("getOrderByDescription", () => {
    it("should work with fields", () => {
      const query = {
        "source-table": PRODUCTS.id,
        "order-by": [["asc", ["field", PRODUCTS.CATEGORY.id, null]]],
      };

      expect(getOrderByDescription(PRODUCTS, query)).toEqual([
        "Sorted by ",
        ["Category ascending"],
      ]);
    });

    it("should work with aggregations", () => {
      const query = {
        "source-table": PRODUCTS.id,
        aggregation: [["count"]],
        breakout: [["field", PRODUCTS.CATEGORY.id, null]],
        "order-by": [["asc", ["aggregation", 0, null]]],
      };
      expect(getOrderByDescription(PRODUCTS, query)).toEqual([
        "Sorted by ",
        ["Count ascending"],
      ]);
    });

    it("should work with expressions", () => {
      const query = {
        "source-table": PRODUCTS.id,
        expressions: {
          Foo: ["concat", "Foo ", ["field", 4, null]],
        },
        "order-by": [["asc", ["expression", "Foo", null]]],
      };
      expect(getOrderByDescription(PRODUCTS, query)).toEqual([
        "Sorted by ",
        ["Foo ascending"],
      ]);
    });
  });
});
