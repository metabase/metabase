import ReactTestUtils from "react-dom/test-utils";

import Dimension from "metabase-lib/lib/Dimension";
import {
  metadata,
  ORDERS_CREATED_DATE_FIELD_ID,
  ORDERS_PRODUCT_FK_FIELD_ID,
  PRODUCT_CATEGORY_FIELD_ID,
  PRODUCT_CREATED_AT_FIELD_ID,
} from "__support__/sample_dataset_fixture";

describe("Dimension", () => {
  describe("parseMBQL", () => {
    it("should parse (deprecated) bare field ID", () => {
      const dimension = Dimension.parseMBQL(
        ORDERS_PRODUCT_FK_FIELD_ID,
        metadata,
      );
      expect(dimension.mbql()).toEqual([
        "field-id",
        ORDERS_PRODUCT_FK_FIELD_ID,
      ]);
      expect(dimension.render()).toEqual(["Product"]);
    });
    it("should parse field-id", () => {
      const dimension = Dimension.parseMBQL(
        ["field-id", ORDERS_PRODUCT_FK_FIELD_ID],
        metadata,
      );
      expect(dimension.mbql()).toEqual([
        "field-id",
        ORDERS_PRODUCT_FK_FIELD_ID,
      ]);
      expect(dimension.render()).toEqual(["Product"]);
    });
    it("should parse fk-> with bare field IDs", () => {
      const dimension = Dimension.parseMBQL(
        ["fk->", ORDERS_PRODUCT_FK_FIELD_ID, PRODUCT_CATEGORY_FIELD_ID],
        metadata,
      );
      expect(dimension.mbql()).toEqual([
        "fk->",
        ["field-id", ORDERS_PRODUCT_FK_FIELD_ID],
        ["field-id", PRODUCT_CATEGORY_FIELD_ID],
      ]);
    });
    it("should parse fk-> with field-id", () => {
      const dimension = Dimension.parseMBQL(
        [
          "fk->",
          ["field-id", ORDERS_PRODUCT_FK_FIELD_ID],
          ["field-id", PRODUCT_CATEGORY_FIELD_ID],
        ],
        metadata,
      );
      expect(dimension.mbql()).toEqual([
        "fk->",
        ["field-id", ORDERS_PRODUCT_FK_FIELD_ID],
        ["field-id", PRODUCT_CATEGORY_FIELD_ID],
      ]);
      const rendered = dimension.render();
      expect(ReactTestUtils.isElement(rendered[1])).toBe(true); // Icon
      rendered[1] = null;
      expect(rendered).toEqual(["Product", null, "Category"]);
    });

    it("should parse datetime-field", () => {
      const dimension = Dimension.parseMBQL(
        ["datetime-field", ["field-id", PRODUCT_CREATED_AT_FIELD_ID], "hour"],
        metadata,
      );
      expect(dimension.mbql()).toEqual([
        "datetime-field",
        ["field-id", PRODUCT_CREATED_AT_FIELD_ID],
        "hour",
      ]);
      expect(dimension.render()).toEqual(["Created At", ": ", "Hour"]);
    });

    it("should parse datetime-field with fk->", () => {
      const dimension = Dimension.parseMBQL(
        [
          "datetime-field",
          ["fk->", ORDERS_PRODUCT_FK_FIELD_ID, PRODUCT_CREATED_AT_FIELD_ID],
          "hour",
        ],
        metadata,
      );
      expect(dimension.mbql()).toEqual([
        "datetime-field",
        [
          "fk->",
          ["field-id", ORDERS_PRODUCT_FK_FIELD_ID],
          ["field-id", PRODUCT_CREATED_AT_FIELD_ID],
        ],

        "hour",
      ]);
      const rendered = dimension.render();
      expect(ReactTestUtils.isElement(rendered[1])).toBe(true); // Icon
      rendered[1] = null;
      expect(rendered).toEqual(["Product", null, "Created At", ": ", "Hour"]);
    });
  });
});
