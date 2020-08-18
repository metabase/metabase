import Dimension, { FKDimension } from "metabase-lib/lib/Dimension";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import {
  metadata,
  ORDERS,
  PRODUCTS,
  SAMPLE_DATASET,
} from "__support__/sample_dataset_fixture";

describe("Dimension", () => {
  describe("STATIC METHODS", () => {
    describe("parseMBQL(mbql metadata)", () => {
      it("should parse (deprecated) bare field ID", () => {
        const dimension = Dimension.parseMBQL(ORDERS.PRODUCT_ID.id, metadata);
        expect(dimension.mbql()).toEqual(["field-id", ORDERS.PRODUCT_ID.id]);
        expect(dimension.render()).toEqual("Product ID");
      });
      it("should parse field-id", () => {
        const dimension = Dimension.parseMBQL(
          ["field-id", ORDERS.PRODUCT_ID.id],
          metadata,
        );
        expect(dimension.mbql()).toEqual(["field-id", ORDERS.PRODUCT_ID.id]);
        expect(dimension.render()).toEqual("Product ID");
      });
      it("should parse fk-> with bare field IDs", () => {
        const dimension = Dimension.parseMBQL(
          ["fk->", ORDERS.PRODUCT_ID.id, PRODUCTS.CATEGORY.id],
          metadata,
        );
        expect(dimension.mbql()).toEqual([
          "fk->",
          ["field-id", ORDERS.PRODUCT_ID.id],
          ["field-id", PRODUCTS.CATEGORY.id],
        ]);
      });
      it("should parse fk-> with field-id", () => {
        const dimension = Dimension.parseMBQL(
          [
            "fk->",
            ["field-id", ORDERS.PRODUCT_ID.id],
            ["field-id", PRODUCTS.CATEGORY.id],
          ],
          metadata,
        );
        expect(dimension.mbql()).toEqual([
          "fk->",
          ["field-id", ORDERS.PRODUCT_ID.id],
          ["field-id", PRODUCTS.CATEGORY.id],
        ]);
        expect(dimension.render()).toEqual("Product → Category");
      });

      it("should parse datetime-field", () => {
        const dimension = Dimension.parseMBQL(
          ["datetime-field", ["field-id", PRODUCTS.CREATED_AT.id], "hour"],
          metadata,
        );
        expect(dimension.mbql()).toEqual([
          "datetime-field",
          ["field-id", PRODUCTS.CREATED_AT.id],
          "hour",
        ]);
        expect(dimension.render()).toEqual("Created At: Hour");
      });

      it("should parse datetime-field with fk->", () => {
        const dimension = Dimension.parseMBQL(
          [
            "datetime-field",
            ["fk->", ORDERS.PRODUCT_ID.id, PRODUCTS.CREATED_AT.id],
            "hour",
          ],
          metadata,
        );
        expect(dimension.mbql()).toEqual([
          "datetime-field",
          [
            "fk->",
            ["field-id", ORDERS.PRODUCT_ID.id],
            ["field-id", PRODUCTS.CREATED_AT.id],
          ],

          "hour",
        ]);
        expect(dimension.render()).toEqual("Product → Created At: Hour");
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
        const d1 = Dimension.parseMBQL(
          ["fk->", ["field-id", 1], ["field-id", 2]],
          metadata,
        );
        const d2 = Dimension.parseMBQL(["field-id", 1], metadata);
        expect(d1.isEqual(d2)).toEqual(false);
      });
      it("returns false for same type clauses with different arguments", () => {
        const d1 = Dimension.parseMBQL(
          ["fk->", ["field-id", 1], ["field-id", 2]],
          metadata,
        );
        const d2 = Dimension.parseMBQL(
          ["fk->", ["field-id", 1], ["field-id", 3]],
          metadata,
        );
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

    describe("foriegn", () => {
      it("should return a FKDimension", () => {
        const dimension = ORDERS.PRODUCT_ID.dimension().foreign(
          PRODUCTS.CATEGORY.dimension(),
        );
        expect(dimension).toBeInstanceOf(FKDimension);
        expect(dimension.mbql()).toEqual([
          "fk->",
          ["field-id", ORDERS.PRODUCT_ID.id],
          ["field-id", PRODUCTS.CATEGORY.id],
        ]);
      });
    });
  });

  describe("FieldIDDimension", () => {
    const dimension = Dimension.parseMBQL(
      ["field-id", ORDERS.TOTAL.id],
      metadata,
    );
    const categoryDimension = Dimension.parseMBQL(
      ["field-id", PRODUCTS.CATEGORY.id],
      metadata,
    );

    describe("INSTANCE METHODS", () => {
      describe("mbql()", () => {
        it('returns a "field-id" clause', () => {
          expect(dimension.mbql()).toEqual(["field-id", ORDERS.TOTAL.id]);
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
              ["field-id", PRODUCTS.CATEGORY.id],
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
      describe("column()", () => {
        expect(dimension.column()).toEqual({
          id: 6,
          name: "TOTAL",
          display_name: "Total",
          base_type: "type/Float",
          special_type: "type/Currency",
          field_ref: ["field-id", ORDERS.TOTAL.id],
        });
      });
    });
  });

  describe("FKDimension", () => {
    const dimension = Dimension.parseMBQL(
      [
        "fk->",
        ["field-id", ORDERS.PRODUCT_ID.id],
        ["field-id", PRODUCTS.TITLE.id],
      ],
      metadata,
    );

    describe("STATIC METHODS", () => {
      describe("dimensions(parentDimension)", () => {
        it("should return array of FK dimensions for foreign key field dimension", () => {
          pending();
          // Something like this:
          // fieldsInProductsTable = metadata.table(1).fields.length;
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
            ["field-id", ORDERS.PRODUCT_ID.id],
            ["field-id", PRODUCTS.TITLE.id],
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
      describe("column()", () => {
        expect(dimension.column()).toEqual({
          id: PRODUCTS.TITLE.id,
          name: "TITLE",
          display_name: "Title",
          base_type: "type/Text",
          special_type: "type/Category",
          fk_field_id: ORDERS.PRODUCT_ID.id,
          field_ref: [
            "fk->",
            ["field-id", ORDERS.PRODUCT_ID.id],
            ["field-id", PRODUCTS.TITLE.id],
          ],
        });
      });
    });
  });

  describe("DatetimeFieldDimension", () => {
    const dimension = Dimension.parseMBQL(
      ["datetime-field", ORDERS.CREATED_AT.id, "month"],
      metadata,
    );

    describe("STATIC METHODS", () => {
      describe("dimensions(parentDimension)", () => {
        it("should return an array with dimensions for each datetime unit", () => {
          pending();
          // Something like this:
          // fieldsInProductsTable = metadata.table(1).fields.length;
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
            ["field-id", ORDERS.CREATED_AT.id],
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

      describe("column()", () => {
        expect(dimension.column()).toEqual({
          id: ORDERS.CREATED_AT.id,
          name: "CREATED_AT",
          display_name: "Created At",
          base_type: "type/DateTime",
          special_type: null,
          field_ref: [
            "datetime-field",
            ["field-id", ORDERS.CREATED_AT.id],
            "month",
          ],
          unit: "month",
        });
      });
    });
  });

  describe("BinningStrategyDimension", () => {
    const dimension = Dimension.parseMBQL(
      ["field-id", ORDERS.TOTAL.id],
      metadata,
    ).dimensions()[1];

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
            ["field-id", ORDERS.TOTAL.id],
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

      describe("column()", () => {
        expect(dimension.column()).toEqual({
          id: ORDERS.TOTAL.id,
          name: "TOTAL",
          display_name: "Total",
          base_type: "type/Float",
          special_type: "type/Currency",
          field_ref: [
            "binning-strategy",
            ["field-id", ORDERS.TOTAL.id],
            "num-bins",
            10,
          ],
        });
      });
    });
  });

  describe("ExpressionDimension", () => {
    const dimension = Dimension.parseMBQL(
      ["expression", "Hello World"],
      metadata,
    );

    describe("STATIC METHODS", () => {
      describe("dimensions(parentDimension)", () => {
        it("should return array of FK dimensions for foreign key field dimension", () => {
          pending();
          // Something like this:
          // fieldsInProductsTable = metadata.table(1).fields.length;
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

      describe("column()", () => {
        expect(dimension.column()).toEqual({
          id: ["expression", "Hello World"],
          name: "Hello World",
          display_name: "Hello World",
          base_type: "type/Float",
          special_type: null,
          field_ref: ["expression", "Hello World"],
        });
      });
    });
  });

  describe("JoinedDimension", () => {
    const dimension = Dimension.parseMBQL(
      ["joined-field", "join1", ["field-id", ORDERS.TOTAL.id]],
      metadata,
    );

    describe("INSTANCE METHODS", () => {
      describe("mbql()", () => {
        it('returns a "joined-field" clause', () => {
          expect(dimension.mbql()).toEqual([
            "joined-field",
            "join1",
            ["field-id", ORDERS.TOTAL.id],
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
      });
      describe("subTriggerDisplayName()", () => {
        it("returns 'Unbinned' if the dimension is a binnable number", () => {
          expect(dimension.subTriggerDisplayName()).toBe("Unbinned");
        });
      });
      describe("column()", () => {
        expect(dimension.column()).toEqual({
          id: ORDERS.TOTAL.id,
          name: "TOTAL",
          display_name: "Total",
          base_type: "type/Float",
          special_type: "type/Currency",
          field_ref: ["joined-field", "join1", ["field-id", ORDERS.TOTAL.id]],
        });
      });
    });
  });

  describe("AggregationDimension", () => {
    const dimension = Dimension.parseMBQL(["aggregation", 1], metadata);

    describe("INSTANCE METHODS", () => {
      describe("mbql()", () => {
        it('returns an "aggregation" clause', () => {
          expect(dimension.mbql()).toEqual(["aggregation", 1]);
        });
      });

      function aggregation(agg) {
        const query = new StructuredQuery(ORDERS.question(), {
          type: "query",
          database: SAMPLE_DATASET.id,
          query: {
            "source-table": ORDERS.id,
            aggregation: [agg],
          },
        });
        return Dimension.parseMBQL(["aggregation", 0], metadata, query);
      }

      describe("column()", () => {
        function sumOf(column) {
          return aggregation(["sum", ["field-id", column.id]]);
        }

        it("should clear unaggregated special types", () => {
          const { special_type } = sumOf(ORDERS.PRODUCT_ID).column();

          expect(special_type).toBe(undefined);
        });

        it("should retain aggregated special types", () => {
          const { special_type } = sumOf(ORDERS.TOTAL).column();

          expect(special_type).toBe("type/Currency");
        });
      });

      describe("field()", () => {
        it("should return a float field for sum of order total", () => {
          const { base_type } = aggregation([
            "sum",
            ["field-id", ORDERS.TOTAL.id],
          ]).field();
          expect(base_type).toBe("type/Float");
        });

        it("should return an int field for count distinct of product category", () => {
          const { base_type } = aggregation([
            "distinct",
            ["field-id", PRODUCTS.CATEGORY.id],
          ]).field();
          expect(base_type).toBe("type/Integer");
        });

        it("should return an int field for count", () => {
          const { base_type } = aggregation(["count"]).field();
          expect(base_type).toBe("type/Integer");
        });
      });
    });
  });
});
