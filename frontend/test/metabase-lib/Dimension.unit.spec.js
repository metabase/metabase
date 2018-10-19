import ReactTestUtils from "react-dom/test-utils";

import Dimension from "metabase-lib/lib/Dimension";
import {
  metadata,
  ORDERS_PRODUCT_FK_FIELD_ID,
  PRODUCT_CATEGORY_FIELD_ID,
  PRODUCT_CREATED_AT_FIELD_ID,
  PRODUCT_TILE_FIELD_ID,
  ORDERS_CREATED_DATE_FIELD_ID,
  ORDERS_TOTAL_FIELD_ID,
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

    describe("STATIC METHODS", () => {
      describe("parseMBQL(mbql metadata)", () => {
        it("parses and format MBQL correctly", () => {
          expect(Dimension.parseMBQL(1, metadata).mbql()).toEqual([
            "field-id",
            1,
          ]);
          expect(Dimension.parseMBQL(["field-id", 1], metadata).mbql()).toEqual(
            ["field-id", 1],
          );
          expect(Dimension.parseMBQL(["fk->", 1, 2], metadata).mbql()).toEqual([
            "fk->",
            ["field-id", 1],
            ["field-id", 2],
          ]);
          expect(
            Dimension.parseMBQL(
              ["datetime-field", 1, "month"],
              metadata,
            ).mbql(),
          ).toEqual(["datetime-field", ["field-id", 1], "month"]);
          expect(
            Dimension.parseMBQL(
              ["datetime-field", ["field-id", 1], "month"],
              metadata,
            ).mbql(),
          ).toEqual(["datetime-field", ["field-id", 1], "month"]);
          expect(
            Dimension.parseMBQL(
              [
                "datetime-field",
                ["fk->", ["field-id", 1], ["field-id", 2]],
                "month",
              ],
              metadata,
            ).mbql(),
          ).toEqual([
            "datetime-field",
            ["fk->", ["field-id", 1], ["field-id", 2]],
            "month",
          ]);
        });
      });

      describe("isEqual(other)", () => {
        it("returns true for equivalent field-ids", () => {
          const d1 = Dimension.parseMBQL(1, metadata);
          const d2 = Dimension.parseMBQL(["field-id", 1], metadata);
          expect(d1.isEqual(d2)).toEqual(true);
          expect(d1.isEqual(["field-id", 1])).toEqual(true);
          expect(d1.isEqual(1)).toEqual(true);
        });
        it("returns false for different type clauses", () => {
          const d1 = Dimension.parseMBQL(["fk->", 1, 2], metadata);
          const d2 = Dimension.parseMBQL(["field-id", 1], metadata);
          expect(d1.isEqual(d2)).toEqual(false);
        });
        it("returns false for same type clauses with different arguments", () => {
          const d1 = Dimension.parseMBQL(["fk->", 1, 2], metadata);
          const d2 = Dimension.parseMBQL(["fk->", 1, 3], metadata);
          expect(d1.isEqual(d2)).toEqual(false);
        });
      });
    });

    describe("INSTANCE METHODS", () => {
      describe("dimensions()", () => {
        it("returns `dimension_options` of the underlying field if available", () => {
          pending();
        });
        it("returns sub-dimensions for matching dimension if no `dimension_options`", () => {
          // just a single scenario should be sufficient here as we will test
          // `static dimensions()` individually for each dimension
          pending();
        });
      });

      describe("isSameBaseDimension(other)", () => {
        it("returns true if the base dimensions are same", () => {
          pending();
        });
        it("returns false if the base dimensions don't match", () => {
          pending();
        });
      });
    });

    describe("FieldIDDimension", () => {
      let dimension = null;
      let categoryDimension = null;
      beforeAll(() => {
        dimension = Dimension.parseMBQL(
          ["field-id", ORDERS_TOTAL_FIELD_ID],
          metadata,
        );
        categoryDimension = Dimension.parseMBQL(
          ["field-id", PRODUCT_CATEGORY_FIELD_ID],
          metadata,
        );
      });

      describe("INSTANCE METHODS", () => {
        describe("mbql()", () => {
          it('returns a "field-id" clause', () => {
            expect(dimension.mbql()).toEqual([
              "field-id",
              ORDERS_TOTAL_FIELD_ID,
            ]);
          });
        });
        describe("displayName()", () => {
          it("returns the field name", () => {
            expect(dimension.displayName()).toEqual("Total");
          });
        });
        describe("subDisplayName()", () => {
          it("returns 'Default' for numeric fields", () => {
            expect(dimension.subDisplayName()).toEqual("Default");
          });
          it("returns 'Default' for non-numeric fields", () => {
            expect(
              Dimension.parseMBQL(
                ["field-id", PRODUCT_CATEGORY_FIELD_ID],
                metadata,
              ).subDisplayName(),
            ).toEqual("Default");
          });
        });
        describe("subTriggerDisplayName()", () => {
          it("returns 'Unbinned' if the dimension is a binnable number", () => {
            expect(dimension.subTriggerDisplayName()).toBe("Unbinned");
          });
          it("does not have a value if the dimension is a category", () => {
            expect(categoryDimension.subTriggerDisplayName()).toBeFalsy();
          });
        });
      });
    });

    describe("FKDimension", () => {
      let dimension = null;
      beforeAll(() => {
        dimension = Dimension.parseMBQL(
          ["fk->", ORDERS_PRODUCT_FK_FIELD_ID, PRODUCT_TILE_FIELD_ID],
          metadata,
        );
      });

      describe("STATIC METHODS", () => {
        describe("dimensions(parentDimension)", () => {
          it("should return array of FK dimensions for foreign key field dimension", () => {
            pending();
            // Something like this:
            // fieldsInProductsTable = metadata.tables[1].fields.length;
            // expect(FKDimension.dimensions(fkFieldIdDimension).length).toEqual(fieldsInProductsTable);
          });
          it("should return empty array for non-FK field dimension", () => {
            pending();
          });
        });
      });

      describe("INSTANCE METHODS", () => {
        describe("mbql()", () => {
          it('returns a "fk->" clause', () => {
            expect(dimension.mbql()).toEqual([
              "fk->",
              ["field-id", ORDERS_PRODUCT_FK_FIELD_ID],
              ["field-id", PRODUCT_TILE_FIELD_ID],
            ]);
          });
        });
        describe("displayName()", () => {
          it("returns the field name", () => {
            expect(dimension.displayName()).toEqual("Title");
          });
        });
        describe("subDisplayName()", () => {
          it("returns the field name", () => {
            expect(dimension.subDisplayName()).toEqual("Title");
          });
        });
        describe("subTriggerDisplayName()", () => {
          it("does not have a value", () => {
            expect(dimension.subTriggerDisplayName()).toBeFalsy();
          });
        });
      });
    });

    describe("DatetimeFieldDimension", () => {
      let dimension = null;
      beforeAll(() => {
        dimension = Dimension.parseMBQL(
          ["datetime-field", ORDERS_CREATED_DATE_FIELD_ID, "month"],
          metadata,
        );
      });

      describe("STATIC METHODS", () => {
        describe("dimensions(parentDimension)", () => {
          it("should return an array with dimensions for each datetime unit", () => {
            pending();
            // Something like this:
            // fieldsInProductsTable = metadata.tables[1].fields.length;
            // expect(FKDimension.dimensions(fkFieldIdDimension).length).toEqual(fieldsInProductsTable);
          });
          it("should return empty array for non-date field dimension", () => {
            pending();
          });
        });
        describe("defaultDimension(parentDimension)", () => {
          it("should return dimension with 'day' datetime unit", () => {
            pending();
          });
          it("should return null for non-date field dimension", () => {
            pending();
          });
        });
      });

      describe("INSTANCE METHODS", () => {
        describe("mbql()", () => {
          it('returns a "datetime-field" clause', () => {
            expect(dimension.mbql()).toEqual([
              "datetime-field",
              ["field-id", ORDERS_CREATED_DATE_FIELD_ID],
              "month",
            ]);
          });
        });
        describe("displayName()", () => {
          it("returns the field name", () => {
            expect(dimension.displayName()).toEqual("Created At");
          });
        });
        describe("subDisplayName()", () => {
          it("returns 'Month'", () => {
            expect(dimension.subDisplayName()).toEqual("Month");
          });
        });
        describe("subTriggerDisplayName()", () => {
          it("returns 'by month'", () => {
            expect(dimension.subTriggerDisplayName()).toEqual("by month");
          });
        });
      });
    });

    describe("BinningStrategyDimension", () => {
      let dimension = null;
      beforeAll(() => {
        dimension = Dimension.parseMBQL(
          ["field-id", ORDERS_TOTAL_FIELD_ID],
          metadata,
        ).dimensions()[1];
      });

      describe("STATIC METHODS", () => {
        describe("dimensions(parentDimension)", () => {
          it("should return an array of dimensions based on default binning", () => {
            pending();
          });
          it("should return empty array for non-number field dimension", () => {
            pending();
          });
        });
      });

      describe("INSTANCE METHODS", () => {
        describe("mbql()", () => {
          it('returns a "binning-strategy" clause', () => {
            expect(dimension.mbql()).toEqual([
              "binning-strategy",
              ["field-id", ORDERS_TOTAL_FIELD_ID],
              "num-bins",
              10,
            ]);
          });
        });
        describe("displayName()", () => {
          it("returns the field name", () => {
            expect(dimension.displayName()).toEqual("Total");
          });
        });
        describe("subDisplayName()", () => {
          it("returns '10 bins'", () => {
            expect(dimension.subDisplayName()).toEqual("10 bins");
          });
        });

        describe("subTriggerDisplayName()", () => {
          it("returns '10 bins'", () => {
            expect(dimension.subTriggerDisplayName()).toEqual("10 bins");
          });
        });
      });
    });

    describe("ExpressionDimension", () => {
      let dimension = null;
      beforeAll(() => {
        dimension = Dimension.parseMBQL(
          ["expression", "Hello World"],
          metadata,
        );
      });

      describe("STATIC METHODS", () => {
        describe("dimensions(parentDimension)", () => {
          it("should return array of FK dimensions for foreign key field dimension", () => {
            pending();
            // Something like this:
            // fieldsInProductsTable = metadata.tables[1].fields.length;
            // expect(FKDimension.dimensions(fkFieldIdDimension).length).toEqual(fieldsInProductsTable);
          });
          it("should return empty array for non-FK field dimension", () => {
            pending();
          });
        });
      });

      describe("INSTANCE METHODS", () => {
        describe("mbql()", () => {
          it('returns an "expression" clause', () => {
            expect(dimension.mbql()).toEqual(["expression", "Hello World"]);
          });
        });
        describe("displayName()", () => {
          it("returns the expression name", () => {
            expect(dimension.displayName()).toEqual("Hello World");
          });
        });
      });
    });

    describe("AggregationDimension", () => {
      let dimension = null;
      beforeAll(() => {
        dimension = Dimension.parseMBQL(["aggregation", 1], metadata);
      });

      describe("INSTANCE METHODS", () => {
        describe("mbql()", () => {
          it('returns an "aggregation" clause', () => {
            expect(dimension.mbql()).toEqual(["aggregation", 1]);
          });
        });
      });
    });
  });
});
