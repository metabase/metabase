import { ORDERS, PRODUCTS } from "__support__/sample_dataset_fixture";

import { parseQueryParam } from "metabase/parameters/components/Parameters";

describe("Parameters", () => {
  describe("parseQueryParam", () => {
    it("should parse numbers", () => {
      expect(parseQueryParam("1.23", [ORDERS.TOTAL])).toBe(1.23);
    });
    it("should parse booleans", () => {
      // the sample dataset doesn't have any boolean columns, so we fake one
      const field = { isBoolean: () => true, isNumeric: () => false };
      expect(parseQueryParam("true", [field])).toBe(true);
    });
    it("should parse multiple values", () => {
      const result = parseQueryParam(["123", "321"], [ORDERS.PRODUCT_ID]);
      expect(result).toEqual([123, 321]);
    });
    it("should not parse if some connected fields are strings", () => {
      const result = parseQueryParam("123", [PRODUCTS.ID, PRODUCTS.TITLE]);
      expect(result).toBe("123");
    });
    it("should not parse if there are no fields", () => {
      const result = parseQueryParam("123", []);
      expect(result).toBe("123");
    });
  });
});
