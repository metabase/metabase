import Field from "metabase-lib/lib/metadata/Field";

import { ORDERS, PRODUCTS } from "__support__/sample_dataset_fixture";

import { getValueFromFields } from "metabase/parameters/components/Parameters/syncQueryParamsWithURL";

describe("Parameters", () => {
  describe("getValueFromFields", () => {
    it("should parse numbers", () => {
      expect(getValueFromFields("1.23", [ORDERS.TOTAL])).toBe(1.23);
    });

    it("should parse booleans", () => {
      // the sample dataset doesn't have any boolean columns, so we fake one
      const field = { isBoolean: () => true, isNumeric: () => false };
      expect(getValueFromFields("true", [field])).toBe(true);
    });

    it("should parse multiple values", () => {
      const result = getValueFromFields(["123", "321"], [ORDERS.PRODUCT_ID]);
      expect(result).toEqual([123, 321]);
    });

    it("should not parse if some connected fields are strings", () => {
      const result = getValueFromFields("123", [PRODUCTS.ID, PRODUCTS.TITLE]);
      expect(result).toBe("123");
    });

    it("should not parse if there are no fields", () => {
      const result = getValueFromFields("123", []);
      expect(result).toBe("123");
    });

    it("should not parse date/numeric fields", () => {
      const dateField = new Field({
        ...ORDERS.QUANTITY, // some numeric field
        // this test doesn't make as much sense now that coercions set effective_types
        effective_type: "type/DateTime", // make it a date
        coercion_strategy: "Coercion/UNIXSeconds->DateTime",
      });
      const result = getValueFromFields("past30days", [dateField]);
      expect(result).toBe("past30days");
    });
  });
});
