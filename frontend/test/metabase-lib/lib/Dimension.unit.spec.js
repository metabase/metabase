import Dimension, { FieldDimension } from "metabase-lib/lib/Dimension";
import Field from "metabase-lib/lib/metadata/Field";
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
      describe("field with ID", () => {
        const mbql = ["field", ORDERS.PRODUCT_ID.id, null];
        const dimension = Dimension.parseMBQL(mbql, metadata);
        it("should parse correctly", () => {
          expect(dimension).toBeInstanceOf(FieldDimension);
          expect(dimension.isIntegerFieldId()).toEqual(true);
          expect(dimension.isStringFieldName()).toEqual(false);
          expect(dimension.fieldIdOrName()).toEqual(ORDERS.PRODUCT_ID.id);
          expect(dimension.mbql()).toEqual(mbql);
        });

        it("should normalize options", () => {
          expect(Dimension.parseMBQL(["field", 1, null])._options).toEqual(
            null,
          );
          expect(Dimension.parseMBQL(["field", 1, {}])._options).toEqual(null);
          expect(
            Dimension.parseMBQL(["field", 1, { "source-field": null }])
              ._options,
          ).toEqual(null);

          expect(
            Dimension.parseMBQL([
              "field",
              1,
              { "source-field": null, "join-alias": "wow" },
            ])._options,
          ).toEqual({ "join-alias": "wow" });
        });

        it("should render correctly", () => {
          expect(dimension.render()).toEqual("Product ID");
        });
      });

      describe("field with FK source-field", () => {
        const mbql = [
          "field",
          PRODUCTS.CATEGORY.id,
          { "source-field": ORDERS.PRODUCT_ID.id },
        ];
        const dimension = Dimension.parseMBQL(mbql, metadata);

        it("should parse correctly", () => {
          expect(dimension).toBeInstanceOf(FieldDimension);
          expect(dimension.mbql()).toEqual(mbql);
          expect(dimension.render()).toEqual("Product → Category");
        });
      });

      describe("field with temporal bucketing", () => {
        const mbql = [
          "field",
          PRODUCTS.CREATED_AT.id,
          { "temporal-unit": "hour" },
        ];
        const dimension = Dimension.parseMBQL(mbql, metadata);

        it("should parse correctly", () => {
          expect(dimension).toBeInstanceOf(FieldDimension);
          expect(dimension.mbql()).toEqual(mbql);
        });

        it("should render correctly", () => {
          expect(dimension.render()).toEqual("Created At: Hour");
        });
      });

      describe("field with both temporal bucketing and FK source-field", () => {
        const mbql = [
          "field",
          PRODUCTS.CREATED_AT.id,
          { "temporal-unit": "hour", "source-field": ORDERS.PRODUCT_ID.id },
        ];
        const dimension = Dimension.parseMBQL(mbql, metadata);

        it("should parse correctly", () => {
          expect(dimension).toBeInstanceOf(FieldDimension);
          expect(dimension.mbql()).toEqual(mbql);
          expect(dimension.getOption("source-field")).toEqual(
            ORDERS.PRODUCT_ID.id,
          );
        });

        it("should render correctly", () => {
          expect(dimension.render()).toEqual("Product → Created At: Hour");
        });
      });
    });

    describe("isEqual(other)", () => {
      it("returns true for equivalent field clauses", () => {
        const d1 = Dimension.parseMBQL(["field", 1, null], metadata);
        const d2 = Dimension.parseMBQL(["field", 1, {}], metadata);
        expect(d1.isEqual(d2)).toEqual(true);
        expect(d1.isEqual(["field", 1, null])).toEqual(true);
        expect(d1.isEqual(["field", 1, {}])).toEqual(true);
      });
      it("returns false for different type clauses", () => {
        const d1 = Dimension.parseMBQL(
          ["field", 2, { "source-field": 1 }],
          metadata,
        );
        const d2 = Dimension.parseMBQL(["field", 1, null], metadata);
        expect(d1.isEqual(d2)).toEqual(false);
      });
      it("returns false for field clauses with different arguments", () => {
        const d1 = Dimension.parseMBQL(
          ["field", 2, { "source-field": 1 }],
          metadata,
        );
        const d2 = Dimension.parseMBQL(
          ["field", 3, { "source-field": 1 }],
          metadata,
        );
        expect(d1.isEqual(d2)).toEqual(false);

        const d3 = Dimension.parseMBQL(
          ["field", 2, { "source-field": 2 }],
          metadata,
        );
        expect(d1.isEqual(d3)).toEqual(false);
      });
    });
  });

  describe("INSTANCE METHODS", () => {
    describe("foriegn", () => {
      it("should return a FieldDimension", () => {
        const dimension = ORDERS.PRODUCT_ID.dimension().foreign(
          PRODUCTS.CATEGORY.dimension(),
        );
        expect(dimension).toBeInstanceOf(FieldDimension);
        expect(dimension.mbql()).toEqual([
          "field",
          PRODUCTS.CATEGORY.id,
          { "source-field": ORDERS.PRODUCT_ID.id },
        ]);
      });
    });
  });

  describe("Field with integer ID", () => {
    const dimension = Dimension.parseMBQL(
      ["field", ORDERS.TOTAL.id, null],
      metadata,
    );
    const categoryDimension = Dimension.parseMBQL(
      ["field", PRODUCTS.CATEGORY.id, null],
      metadata,
    );

    describe("STATIC METHODS", () => {
      describe("normalizeOptions()", () => {
        it("should remove empty options map", () => {
          expect(FieldDimension.normalizeOptions(null)).toEqual(null);
          expect(FieldDimension.normalizeOptions({})).toEqual(null);
        });
        it("should remove null/undefined keys", () => {
          expect(
            FieldDimension.normalizeOptions({
              x: false,
              y: null,
              z: undefined,
            }),
          ).toEqual({ x: false });
        });
        it("should recursively normalize maps options", () => {
          expect(
            FieldDimension.normalizeOptions({ binning: { x: null } }),
          ).toBe(null);
        });
        // TODO -- it should also remove empty arrays, but we currently don't have any situations where there might be
        // one.
      });
    });

    describe("INSTANCE METHODS", () => {
      describe("mbql()", () => {
        it(
          'returns a "field" clause',
          () => {
            expect(dimension.mbql()).toEqual(["field", ORDERS.TOTAL.id, null]);
          },
          null,
        );
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
              ["field", PRODUCTS.CATEGORY.id, null],
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
          semantic_type: "type/Currency",
          field_ref: ["field", ORDERS.TOTAL.id, null],
        });
      });
      describe("field()", () => {
        it("should return correct Field for underlying Field", () => {
          expect(dimension.field().id).toEqual(ORDERS.TOTAL.id);
          expect(dimension.field().metadata).toEqual(metadata);
          expect(dimension.field().displayName()).toEqual("Total");
        });
      });
    });
  });

  // TODO -- there are some tests against fields that can be binned above -- we should merge them in with these ones
  describe("Numeric Field that can be binned", () => {
    const mbql = ["field", ORDERS.TOTAL.id, { "base-type": "type/Float" }];
    const dimension = Dimension.parseMBQL(mbql, metadata);

    describe("INSTANCE METHODS", () => {
      describe("isBinnable()", () => {
        it("should return truthy", () => {
          expect(dimension.isBinnable()).toBeTruthy();
        });
      });

      describe("defaultDimension()", () => {
        it("should return a dimension with binning options", () => {
          const defaultDimension = dimension.defaultDimension();
          expect(defaultDimension).toBeInstanceOf(FieldDimension);
          expect(defaultDimension.mbql()).toEqual([
            "field",
            ORDERS.TOTAL.id,
            {
              "base-type": "type/Float",
              binning: {
                strategy: "default",
              },
            },
          ]);
        });
      });

      describe("dimensions()[1]", () => {
        it("should be a binned dimension", () => {
          expect(dimension.dimensions()[1].mbql()).toEqual([
            "field",
            ORDERS.TOTAL.id,
            {
              "base-type": "type/Float",
              binning: { strategy: "num-bins", "num-bins": 10 },
            },
          ]);
        });
      });
    });
  });

  describe("Field with FK source Field", () => {
    const dimension = Dimension.parseMBQL(
      ["field", PRODUCTS.TITLE.id, { "source-field": ORDERS.PRODUCT_ID.id }],
      metadata,
    );

    describe("INSTANCE METHODS", () => {
      describe("mbql()", () => {
        it("returns a fk clause", () => {
          expect(dimension.mbql()).toEqual([
            "field",
            PRODUCTS.TITLE.id,
            { "source-field": ORDERS.PRODUCT_ID.id },
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
          semantic_type: "type/Category",
          fk_field_id: ORDERS.PRODUCT_ID.id,
          field_ref: [
            "field",
            PRODUCTS.TITLE.id,
            { "source-field": ORDERS.PRODUCT_ID.id },
          ],
        });
      });
      describe("fk()", () => {
        const fk = dimension.fk();
        expect(fk).toBeInstanceOf(FieldDimension);
        expect(fk.mbql()).toEqual(["field", ORDERS.PRODUCT_ID.id, null]);
        expect(fk.render()).toEqual("Product ID");
        expect(fk._metadata).toEqual(metadata);
      });
    });
  });

  describe("Field with temporal bucketing", () => {
    const dimension = Dimension.parseMBQL(
      ["field", ORDERS.CREATED_AT.id, { "temporal-unit": "month" }],
      metadata,
    );

    describe("INSTANCE METHODS", () => {
      describe("mbql()", () => {
        it("returns a field clause with temporal unit", () => {
          expect(dimension.mbql()).toEqual([
            "field",
            ORDERS.CREATED_AT.id,
            { "temporal-unit": "month" },
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
          semantic_type: null,
          field_ref: [
            "field",
            ORDERS.CREATED_AT.id,
            { "temporal-unit": "month" },
          ],
          unit: "month",
        });
      });

      describe("temporalUnit()", () => {
        expect(dimension.getOption("temporal-unit")).toEqual("month");
        expect(dimension.temporalUnit()).toEqual("month");
      });

      describe("withoutTemporalBucketing()", () => {
        const noBucketing = dimension.withoutTemporalBucketing();
        expect(noBucketing.getOption("temporal-unit")).toBeFalsy();
        expect(noBucketing.temporalUnit()).toBeFalsy();
        expect(noBucketing.mbql()).toEqual([
          "field",
          ORDERS.CREATED_AT.id,
          null,
        ]);
      });

      // TODO -- withTemporalUnit()
    });
  });

  describe("field with both temporal bucketing and FK source-field", () => {
    const mbql = [
      "field",
      PRODUCTS.CREATED_AT.id,
      { "temporal-unit": "hour", "source-field": ORDERS.PRODUCT_ID.id },
    ];
    const dimension = Dimension.parseMBQL(mbql, metadata);

    describe("INSTANCE METHODS", () => {
      describe(".field()", () => {
        expect(dimension.field()).toBeInstanceOf(Field);
        expect(dimension.field().id).toEqual(PRODUCTS.CREATED_AT.id);
        expect(dimension.field().metadata).toEqual(metadata);
        expect(dimension.field().displayName()).toEqual("Created At");
      });
    });

    describe("temporal methods", () => {
      it("should return temporal unit correctly", () => {
        expect(dimension.temporalUnit()).toEqual("hour");
      });

      it("should remove temporal unit without removing FK source field", () => {
        const noBucketing = dimension.withoutTemporalBucketing();
        expect(noBucketing.temporalUnit()).toBeFalsy();
        expect(noBucketing.getOption("source-field")).toEqual(
          ORDERS.PRODUCT_ID.id,
        );
        expect(noBucketing.mbql()).toEqual([
          "field",
          PRODUCTS.CREATED_AT.id,
          { "source-field": ORDERS.PRODUCT_ID.id },
        ]);
      });
    });

    describe("FK field", () => {
      const fk = dimension.fk();
      it("should return FK field Dimension when you call fk() method", () => {
        expect(fk).toBeInstanceOf(FieldDimension);
        expect(fk._metadata).toEqual(metadata);
      });
      it("should return underlying Field", () => {
        expect(fk.field()).toBeInstanceOf(Field);
        expect(fk.field().id).toEqual(ORDERS.PRODUCT_ID.id);
        expect(fk.field().displayName()).toEqual("Product ID");
      });
      it("should render correctly", () => {
        expect(fk.mbql()).toEqual(["field", ORDERS.PRODUCT_ID.id, null]);
        expect(fk.render()).toEqual("Product ID");
      });
    });
  });

  describe("field with binning strategy", () => {
    const dimension = Dimension.parseMBQL(
      [
        "field",
        ORDERS.TOTAL.id,
        { binning: { strategy: "num-bins", "num-bins": 10 } },
      ],
      metadata,
    );

    describe("INSTANCE METHODS", () => {
      describe("mbql()", () => {
        it("returns a field clause with binning strategy", () => {
          expect(dimension.mbql()).toEqual([
            "field",
            ORDERS.TOTAL.id,
            { binning: { strategy: "num-bins", "num-bins": 10 } },
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
          semantic_type: "type/Currency",
          field_ref: [
            "field",
            ORDERS.TOTAL.id,
            { binning: { strategy: "num-bins", "num-bins": 10 } },
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
          base_type: "type/Text",
          semantic_type: null,
          field_ref: ["expression", "Hello World"],
        });
      });
    });
  });

  describe("Field with join-alias", () => {
    const dimension = Dimension.parseMBQL(
      ["field", ORDERS.TOTAL.id, { "join-alias": "join1" }],
      metadata,
    );

    describe("INSTANCE METHODS", () => {
      describe("mbql()", () => {
        it('returns a joined "field" clause', () => {
          expect(dimension.mbql()).toEqual([
            "field",
            ORDERS.TOTAL.id,
            { "join-alias": "join1" },
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
          semantic_type: "type/Currency",
          field_ref: ["field", ORDERS.TOTAL.id, { "join-alias": "join1" }],
        });
      });
      describe("isEqual", () => {
        it("should return true for another Dimension with the same underlying MBQL", () => {
          const anotherDimension = Dimension.parseMBQL([
            "field",
            ORDERS.TOTAL.id,
            { "join-alias": "join1" },
          ]);
          expect(dimension.isEqual(anotherDimension)).toBe(true);
        });
      });
      describe("isSameBaseDimension", () => {
        it("should return true for another Dimension with the same underlying MBQL", () => {
          const anotherDimension = Dimension.parseMBQL([
            "field",
            ORDERS.TOTAL.id,
            { "join-alias": "join1" },
          ]);
          expect(dimension.isSameBaseDimension(anotherDimension)).toBe(true);
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
          return aggregation(["sum", ["field", column.id, null]]);
        }

        it("should clear unaggregated semantic types", () => {
          const { semantic_type } = sumOf(ORDERS.PRODUCT_ID).column();

          expect(semantic_type).toBe(undefined);
        });

        it("should retain aggregated semantic types", () => {
          const { semantic_type } = sumOf(ORDERS.TOTAL).column();

          expect(semantic_type).toBe("type/Currency");
        });
      });

      describe("field()", () => {
        it("should return a float field for sum of order total", () => {
          const { base_type } = aggregation([
            "sum",
            ["field", ORDERS.TOTAL.id, null],
          ]).field();
          expect(base_type).toBe("type/Float");
        });

        it("should return an int field for count distinct of product category", () => {
          const { base_type } = aggregation([
            "distinct",
            ["field", PRODUCTS.CATEGORY.id, null],
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
