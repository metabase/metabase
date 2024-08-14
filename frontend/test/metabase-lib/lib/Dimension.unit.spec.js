import { createMockMetadata } from "__support__/metadata";
import Dimension, {
  FieldDimension,
  TemplateTagDimension,
} from "metabase-lib/v1/Dimension";
import Question from "metabase-lib/v1/Question";
import Field from "metabase-lib/v1/metadata/Field";
import NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import StructuredQuery from "metabase-lib/v1/queries/StructuredQuery";
import TemplateTagVariable from "metabase-lib/v1/variables/TemplateTagVariable";
import {
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const ordersTable = metadata.table(ORDERS_ID);
const productsTable = metadata.table(PRODUCTS_ID);

const nestedQuestionCard = {
  table_id: null,
  result_metadata: [
    {
      name: "boolean",
      display_name: "boolean",
      base_type: "type/Boolean",
      effective_type: "type/Boolean",
      semantic_type: null,
      field_ref: [
        "field",
        "boolean",
        {
          "base-type": "type/Boolean",
        },
      ],
    },
    {
      base_type: "type/Text",
      display_name: "Foo",
      effective_type: "type/Text",
      field_ref: ["expression", "Foo"],
      id: ["field", "Foo", { "base-type": "type/Text" }],
      name: "Foo",
      semantic_type: null,
      table_id: "card__61",
    },
  ],
  database_id: 1,
  query_type: "query",
  name: "nested question",
  dataset_query: {
    database: 1,
    query: {
      "source-table": "card__61",
    },
    type: "query",
  },
  id: 62,
  display: "table",
};

describe("Dimension", () => {
  describe("STATIC METHODS", () => {
    describe("parseMBQL(mbql metadata)", () => {
      describe("field with ID", () => {
        const mbql = ["field", ORDERS.PRODUCT_ID, null];
        const dimension = Dimension.parseMBQL(mbql, metadata);
        it("should parse correctly", () => {
          expect(dimension).toBeInstanceOf(FieldDimension);
          expect(dimension.isIntegerFieldId()).toEqual(true);
          expect(dimension.isStringFieldName()).toEqual(false);
          expect(dimension.fieldIdOrName()).toEqual(ORDERS.PRODUCT_ID);
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
          PRODUCTS.CATEGORY,
          { "source-field": ORDERS.PRODUCT_ID },
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
          PRODUCTS.CREATED_AT,
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
          PRODUCTS.CREATED_AT,
          { "temporal-unit": "hour", "source-field": ORDERS.PRODUCT_ID },
        ];
        const dimension = Dimension.parseMBQL(mbql, metadata);

        it("should parse correctly", () => {
          expect(dimension).toBeInstanceOf(FieldDimension);
          expect(dimension.mbql()).toEqual(mbql);
          expect(dimension.getOption("source-field")).toEqual(
            ORDERS.PRODUCT_ID,
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
    describe("foreign", () => {
      it("should return a FieldDimension", () => {
        const ordersProductId = metadata.field(ORDERS.PRODUCT_ID);
        const productsCategory = metadata.field(PRODUCTS.CATEGORY);
        const dimension = ordersProductId
          .dimension()
          .foreign(productsCategory.dimension());

        expect(dimension).toBeInstanceOf(FieldDimension);
        expect(dimension.mbql()).toEqual([
          "field",
          PRODUCTS.CATEGORY,
          { "source-field": ORDERS.PRODUCT_ID },
        ]);
      });
    });

    describe("getMLv1CompatibleDimension", () => {
      it("should return itself without changes by default", () => {
        const productsCategory = metadata.field(PRODUCTS.CATEGORY);
        const dimension = productsCategory.dimension();
        expect(dimension.getMLv1CompatibleDimension()).toBe(dimension);
      });
    });
  });

  describe("Field with integer ID", () => {
    const dimension = Dimension.parseMBQL(
      ["field", ORDERS.TOTAL, null],
      metadata,
    );
    const categoryDimension = Dimension.parseMBQL(
      ["field", PRODUCTS.CATEGORY, null],
      metadata,
    );

    describe("INSTANCE METHODS", () => {
      describe("mbql()", () => {
        it(
          'returns a "field" clause',
          () => {
            expect(dimension.mbql()).toEqual(["field", ORDERS.TOTAL, null]);
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
              ["field", PRODUCTS.CATEGORY, null],
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
        it("should return the column", () => {
          expect(dimension.column()).toEqual({
            id: ORDERS.TOTAL,
            name: "TOTAL",
            display_name: "Total",
            base_type: "type/Float",
            semantic_type: null,
            field_ref: ["field", ORDERS.TOTAL, null],
          });
        });
      });
      describe("field()", () => {
        it("should return correct Field for underlying Field", () => {
          expect(dimension.field().id).toEqual(ORDERS.TOTAL);
          expect(dimension.field().metadata).toEqual(metadata);
          expect(dimension.field().displayName()).toEqual("Total");
        });

        it("should return the correct Field from a query's result_metadata when the metadata object is missing the Field", () => {
          const emptyMetadata = {
            field: () => {},
            table: () => {},
            card: () => {},
          };

          const question = ordersTable
            .question()
            .setId(1)
            .setResultsMetadata({
              columns: [ORDERS.TOTAL],
            });

          const query = new StructuredQuery(question, {
            type: "query",
            database: SAMPLE_DB_ID,
            query: {
              "source-table": ORDERS_ID,
            },
          });
          const dimension = Dimension.parseMBQL(
            ["field", ORDERS.TOTAL, null],
            emptyMetadata,
            query,
          );

          const field = dimension.field();

          expect(field.id).toEqual(ORDERS.TOTAL);
          expect(field.base_type).toEqual("type/Float");
        });
      });

      describe("getMLv1CompatibleDimension", () => {
        it("should return itself without changes by default", () => {
          const dimension = Dimension.parseMBQL(
            ["field", ORDERS.TOTAL, null],
            metadata,
          );
          expect(dimension.getMLv1CompatibleDimension()).toBe(dimension);
        });

        it("should strip away *-type options", () => {
          const dimension = Dimension.parseMBQL(
            [
              "field",
              ORDERS.TOTAL,
              { "base-type": "type/Float", "effective-type": "type/Float" },
            ],
            metadata,
          );

          expect(dimension.getMLv1CompatibleDimension().mbql()).toEqual([
            "field",
            ORDERS.TOTAL,
            null,
          ]);
        });
      });
    });
  });

  // TODO -- there are some tests against fields that can be binned above -- we should merge them in with these ones
  describe("Numeric Field that can be binned", () => {
    const mbql = ["field", ORDERS.TOTAL, { "base-type": "type/Float" }];
    const dimension = Dimension.parseMBQL(mbql, metadata);

    describe("INSTANCE METHODS", () => {
      describe("_isBinnable()", () => {
        it("should return truthy", () => {
          expect(dimension._isBinnable()).toBeTruthy();
        });
      });

      describe("defaultDimension()", () => {
        it("should return a dimension with binning options", () => {
          const defaultDimension = dimension.defaultDimension();
          expect(defaultDimension).toBeInstanceOf(FieldDimension);
          expect(defaultDimension.mbql()).toEqual([
            "field",
            ORDERS.TOTAL,
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
            ORDERS.TOTAL,
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
      ["field", PRODUCTS.TITLE, { "source-field": ORDERS.PRODUCT_ID }],
      metadata,
    );

    describe("INSTANCE METHODS", () => {
      describe("mbql()", () => {
        it("returns a fk clause", () => {
          expect(dimension.mbql()).toEqual([
            "field",
            PRODUCTS.TITLE,
            { "source-field": ORDERS.PRODUCT_ID },
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
        it("should return the column", () => {
          expect(dimension.column()).toEqual({
            id: PRODUCTS.TITLE,
            name: "TITLE",
            display_name: "Title",
            base_type: "type/Text",
            semantic_type: "type/Title",
            fk_field_id: ORDERS.PRODUCT_ID,
            field_ref: [
              "field",
              PRODUCTS.TITLE,
              { "source-field": ORDERS.PRODUCT_ID },
            ],
          });
        });
      });
      describe("fk()", () => {
        it("should return the fk", () => {
          const fk = dimension.fk();
          expect(fk).toBeInstanceOf(FieldDimension);
          expect(fk.mbql()).toEqual(["field", ORDERS.PRODUCT_ID, null]);
          expect(fk.render()).toEqual("Product ID");
          expect(fk._metadata).toEqual(metadata);
        });
      });
      describe("getMLv1CompatibleDimension", () => {
        it("should strip away *-type options", () => {
          const dimension = Dimension.parseMBQL(
            [
              "field",
              PRODUCTS.TITLE,
              {
                "base-type": "type/Text",
                "effective-type": "type/Text",
                "source-field": ORDERS.PRODUCT_ID,
              },
            ],
            metadata,
          );

          expect(dimension.getMLv1CompatibleDimension().mbql()).toEqual([
            "field",
            PRODUCTS.TITLE,
            { "source-field": ORDERS.PRODUCT_ID },
          ]);
        });
      });
    });
  });

  describe("Field with temporal bucketing", () => {
    const dimension = Dimension.parseMBQL(
      ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
      metadata,
    );

    describe("INSTANCE METHODS", () => {
      describe("mbql()", () => {
        it("returns a field clause with temporal unit", () => {
          expect(dimension.mbql()).toEqual([
            "field",
            ORDERS.CREATED_AT,
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
        it("should return the column", () => {
          expect(dimension.column()).toEqual({
            id: ORDERS.CREATED_AT,
            name: "CREATED_AT",
            display_name: "Created At",
            base_type: "type/DateTime",
            semantic_type: "type/CreationTimestamp",
            field_ref: [
              "field",
              ORDERS.CREATED_AT,
              { "temporal-unit": "month" },
            ],
            unit: "month",
          });
        });
      });

      describe("temporalUnit()", () => {
        it("returns the temporal unit", () => {
          expect(dimension.getOption("temporal-unit")).toEqual("month");
          expect(dimension.temporalUnit()).toEqual("month");
        });
      });

      describe("withoutTemporalBucketing()", () => {
        it("returns a dimension without temporal bucketing", () => {
          const noBucketing = dimension.withoutTemporalBucketing();
          expect(noBucketing.getOption("temporal-unit")).toBeFalsy();
          expect(noBucketing.temporalUnit()).toBeFalsy();
          expect(noBucketing.mbql()).toEqual([
            "field",
            ORDERS.CREATED_AT,
            null,
          ]);
        });
      });
    });
  });

  describe("field with both temporal bucketing and FK source-field", () => {
    const mbql = [
      "field",
      PRODUCTS.CREATED_AT,
      { "temporal-unit": "hour", "source-field": ORDERS.PRODUCT_ID },
    ];
    const dimension = Dimension.parseMBQL(mbql, metadata);

    describe("INSTANCE METHODS", () => {
      describe(".field()", () => {
        it("should return the field", () => {
          expect(dimension.field()).toBeInstanceOf(Field);
          expect(dimension.field().id).toEqual(PRODUCTS.CREATED_AT);
          expect(dimension.field().metadata).toEqual(metadata);
          expect(dimension.field().displayName()).toEqual("Created At");
        });
      });
      describe("getMLv1CompatibleDimension", () => {
        it("should strip away *-type options", () => {
          const dimension = Dimension.parseMBQL(
            [
              "field",
              ORDERS.CREATED_AT,
              {
                "base-type": "type/DateTime",
                "effective-type": "type/DateTime",
                "temporal-unit": "hour",
              },
            ],
            metadata,
          );

          expect(dimension.getMLv1CompatibleDimension().mbql()).toEqual([
            "field",
            ORDERS.CREATED_AT,
            { "temporal-unit": "hour" },
          ]);
        });
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
          ORDERS.PRODUCT_ID,
        );
        expect(noBucketing.mbql()).toEqual([
          "field",
          PRODUCTS.CREATED_AT,
          { "source-field": ORDERS.PRODUCT_ID },
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
        expect(fk.field().id).toEqual(ORDERS.PRODUCT_ID);
        expect(fk.field().displayName()).toEqual("Product ID");
      });
      it("should render correctly", () => {
        expect(fk.mbql()).toEqual(["field", ORDERS.PRODUCT_ID, null]);
        expect(fk.render()).toEqual("Product ID");
      });
    });
  });

  describe("field with binning strategy", () => {
    const dimension = Dimension.parseMBQL(
      [
        "field",
        ORDERS.TOTAL,
        { binning: { strategy: "num-bins", "num-bins": 10 } },
      ],
      metadata,
    );

    describe("INSTANCE METHODS", () => {
      describe("mbql()", () => {
        it("returns a field clause with binning strategy", () => {
          expect(dimension.mbql()).toEqual([
            "field",
            ORDERS.TOTAL,
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
        it("returns the dimension column", () => {
          expect(dimension.column()).toEqual({
            id: ORDERS.TOTAL,
            name: "TOTAL",
            display_name: "Total",
            base_type: "type/Float",
            semantic_type: null,
            field_ref: [
              "field",
              ORDERS.TOTAL,
              { binning: { strategy: "num-bins", "num-bins": 10 } },
            ],
          });
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
        it("returns the dimension column", () => {
          expect(dimension.column()).toEqual({
            id: ["expression", "Hello World"],
            name: "Hello World",
            display_name: "Hello World",
            base_type: "type/Text",
            semantic_type: "type/Text",
            field_ref: ["expression", "Hello World"],
          });
        });
      });

      describe("field", () => {
        it("should return a field inferred from the expression", () => {
          const field = dimension.field();

          expect(field).toBeInstanceOf(Field);
          expect(field.name).toEqual("Hello World");
        });

        describe("when an expression dimension has a query that relies on a nested card", () => {
          it("should return a field inferred from the expression", () => {
            const question = new Question(nestedQuestionCard, null);
            const query = question.legacyQuery({ useStructuredQuery: true });
            const dimension = Dimension.parseMBQL(
              ["expression", "Foobar"], // "Foobar" does not exist in the metadata
              null,
              query,
            );
            const field = dimension.field();

            expect(field).toBeInstanceOf(Field);
            expect(field.name).toEqual("Foobar");
            expect(field.query).toEqual(query);
            expect(field.metadata).toEqual(undefined);
          });

          it("should return a field inferred from the expression (from metadata)", () => {
            const question = new Question(nestedQuestionCard, metadata);
            const query = question.legacyQuery({ useStructuredQuery: true });
            const dimension = Dimension.parseMBQL(
              ["expression", "Foo"],
              metadata,
              query,
            );
            const field = dimension.field();

            expect(field).toBeInstanceOf(Field);
            expect(field.name).toEqual("Foo");
            expect(field.query).toEqual(query);
            expect(field.metadata).toEqual(metadata);
          });
        });
      });

      describe("getMLv1CompatibleDimension", () => {
        it("should strip away *-type options", () => {
          const dimension = Dimension.parseMBQL(
            [
              "expression",
              "Hello World",
              {
                "base-type": "type/Text",
                "effective-type": "type/Text",
              },
            ],
            metadata,
          );

          expect(dimension.getMLv1CompatibleDimension().mbql()).toEqual([
            "expression",
            "Hello World",
          ]);
        });
      });
    });

    describe("dimensions()", () => {
      it("should return subdimensions according to the field type", () => {
        const question = new Question(nestedQuestionCard, metadata);
        const dimension = Dimension.parseMBQL(
          ["expression", 42],
          metadata,
          question.legacyQuery({ useStructuredQuery: true }),
        );
        expect(dimension.dimensions().length).toEqual(5); // 5 different binnings for a number
      });
    });
  });

  describe("Field with join-alias", () => {
    const dimension = Dimension.parseMBQL(
      ["field", ORDERS.TOTAL, { "join-alias": "join1" }],
      metadata,
    );

    describe("INSTANCE METHODS", () => {
      describe("mbql()", () => {
        it('returns a joined "field" clause', () => {
          expect(dimension.mbql()).toEqual([
            "field",
            ORDERS.TOTAL,
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
        it("returns the dimension column", () => {
          expect(dimension.column()).toEqual({
            id: ORDERS.TOTAL,
            name: "TOTAL",
            display_name: "Total",
            base_type: "type/Float",
            semantic_type: null,
            field_ref: ["field", ORDERS.TOTAL, { "join-alias": "join1" }],
          });
        });
      });
      describe("isEqual", () => {
        it("should return true for another Dimension with the same underlying MBQL", () => {
          const anotherDimension = Dimension.parseMBQL([
            "field",
            ORDERS.TOTAL,
            { "join-alias": "join1" },
          ]);
          expect(dimension.isEqual(anotherDimension)).toBe(true);
        });
      });
      describe("isSameBaseDimension", () => {
        it("should return true for another Dimension with the same underlying MBQL", () => {
          const anotherDimension = Dimension.parseMBQL([
            "field",
            ORDERS.TOTAL,
            { "join-alias": "join1" },
          ]);
          expect(dimension.isSameBaseDimension(anotherDimension)).toBe(true);
        });
      });
      describe("getMLv1CompatibleDimension", () => {
        it("should strip away *-type options", () => {
          const dimension = Dimension.parseMBQL(
            [
              "field",
              ORDERS.TOTAL,
              {
                "base-type": "type/DateTime",
                "effective-type": "type/DateTime",
                "join-alias": "join1",
              },
            ],
            metadata,
          );

          expect(dimension.getMLv1CompatibleDimension().mbql()).toEqual([
            "field",
            ORDERS.TOTAL,
            { "join-alias": "join1" },
          ]);
        });
      });
    });
  });

  describe("AggregationDimension", () => {
    const dimension = Dimension.parseMBQL(["aggregation", 1], metadata);

    describe("INSTANCE METHODS", () => {
      describe("mbql()", () => {
        it('returns an "aggregation" clause', () => {
          expect(dimension.mbql()).toEqual(["aggregation", 1, null]);
        });
      });

      function aggregation(agg) {
        const query = new StructuredQuery(ordersTable.question(), {
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
            aggregation: [agg],
          },
        });
        return Dimension.parseMBQL(["aggregation", 0], metadata, query);
      }

      describe("column()", () => {
        function sumOf(column) {
          return aggregation(["sum", ["field", column, null]]);
        }

        it("should clear unaggregated semantic types", () => {
          const { semantic_type } = sumOf(ORDERS.PRODUCT_ID).column();

          expect(semantic_type).toBe(undefined);
        });

        it("should retain aggregated semantic types", () => {
          const { semantic_type } = sumOf(ORDERS.DISCOUNT).column();

          expect(semantic_type).toBe("type/Discount");
        });
      });

      describe("field()", () => {
        it("should return a float field for sum of order total", () => {
          const { base_type } = aggregation([
            "sum",
            ["field", ORDERS.TOTAL, null],
          ]).field();
          expect(base_type).toBe("type/Float");
        });

        it("should return an int field for count distinct of product category", () => {
          const { base_type } = aggregation([
            "distinct",
            ["field", PRODUCTS.CATEGORY, null],
          ]).field();
          expect(base_type).toBe("type/Integer");
        });

        it.each([
          {
            field: ["field", PRODUCTS.CATEGORY, null],
            fieldName: "category",
            expectedType: "type/Text",
          },
          {
            field: ["field", PRODUCTS.PRICE, null],
            fieldName: "price",
            expectedType: "type/Float",
          },
          {
            field: ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "day" }],
            fieldName: "created_at",
            expectedType: "type/DateTime",
          },
        ])(
          "should return $expectedType for min of $fieldName",
          ({ field, expectedType }) => {
            const { base_type } = aggregation(["min", field]).field();
            expect(base_type).toBe(expectedType);
          },
        );

        it.each([
          {
            field: ["field", PRODUCTS.CATEGORY, null],
            fieldName: "category",
            expectedType: "type/Text",
          },
          {
            field: ["field", PRODUCTS.PRICE, null],
            fieldName: "price",
            expectedType: "type/Float",
          },
          {
            field: ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "day" }],
            fieldName: "created_at",
            expectedType: "type/DateTime",
          },
        ])(
          "should return $expectedType for max of $fieldName",
          ({ field, expectedType }) => {
            const { base_type } = aggregation(["max", field]).field();
            expect(base_type).toBe(expectedType);
          },
        );

        it("should return an int field for count", () => {
          const { base_type } = aggregation(["count"]).field();
          expect(base_type).toBe("type/Integer");
        });
      });

      describe("getMLv1CompatibleDimension", () => {
        it("should strip away *-type options", () => {
          const dimension = Dimension.parseMBQL(
            [
              "aggregation",
              1,
              {
                "base-type": "type/Integer",
                "effective-type": "type/Integer",
              },
            ],
            metadata,
          );

          expect(dimension.getMLv1CompatibleDimension().mbql()).toEqual([
            "aggregation",
            1,
            null,
          ]);
        });
      });
    });
  });

  describe("Nested Question Field Dimension", () => {
    const question = new Question(nestedQuestionCard, metadata);

    const dimension = Dimension.parseMBQL(
      ["field", "boolean", { "base-type": "type/Boolean" }],
      metadata,
      question.legacyQuery({ useStructuredQuery: true }),
    );

    describe("INSTANCE METHODS", () => {
      describe("mbql", () => {
        it("returns the field clause", () => {
          expect(dimension.mbql()).toEqual([
            "field",
            "boolean",
            { "base-type": "type/Boolean" },
          ]);
        });
      });

      describe("displayName", () => {
        it("returns the field name", () => {
          expect(dimension.displayName()).toEqual("boolean");
        });
      });

      describe("column", () => {
        it("returns the column", () => {
          expect(dimension.column()).toEqual({
            name: "boolean",
            display_name: "boolean",
            base_type: "type/Boolean",
            semantic_type: undefined,
            id: [
              "field",
              "boolean",
              {
                "base-type": "type/Boolean",
              },
            ],
            field_ref: [
              "field",
              "boolean",
              {
                "base-type": "type/Boolean",
              },
            ],
          });
        });
      });

      describe("field", () => {
        it("should return the `field` from the card's result_metadata", () => {
          const field = dimension.field();
          expect(field.id).toEqual([
            "field",
            "boolean",
            { "base-type": "type/Boolean" },
          ]);
          expect(field.name).toEqual("boolean");
          expect(field.isBoolean()).toBe(true);
          expect(field.metadata).toBeDefined();
          expect(field.query).toBeDefined();
        });
      });
    });
  });

  describe("Dimension with cached, trusted Field instance", () => {
    describe("field", () => {
      it("should return the cached Field instance", () => {
        const category = metadata.field(PRODUCTS.CATEGORY);

        const fieldDimension = category.dimension();
        expect(fieldDimension._fieldInstance).toBe(category);
        expect(fieldDimension.field()).toBe(category);
      });
    });
  });

  describe("TemplateTagDimension", () => {
    describe("dimension tag (ie a field filter)", () => {
      const templateTagClause = ["template-tag", "foo"];
      const query = new NativeQuery(productsTable.question(), {
        database: SAMPLE_DB_ID,
        type: "native",
        native: {
          query: "select * from PRODUCTS where {{foo}}",
          "template-tags": {
            foo: {
              id: "5928ca74-ca36-8706-7bed-0143d7646b6a",
              name: "foo",
              "display-name": "Foo",
              type: "dimension",
              dimension: ["field", PRODUCTS.CATEGORY, null],
              "widget-type": "category",
            },
          },
        },
      });

      const dimension = Dimension.parseMBQL(templateTagClause, metadata, query);

      describe("STATIC METHODS", () => {
        describe("parseMBQL", () => {
          it("returns a TemplateTagDimension", () => {
            expect(dimension).toBeInstanceOf(TemplateTagDimension);
          });

          it("should return null when not given a template tag clause", () => {
            expect(
              TemplateTagDimension.parseMBQL(["field", 123, null], metadata),
            ).toBeNull();
          });
        });
      });

      describe("INSTANCE METHODS", () => {
        describe("tag", () => {
          it("should return the associated tag object from the native query", () => {
            expect(dimension.tag()).toEqual(query.templateTagsMap().foo);
          });
        });

        describe("isDimensionType", () => {
          it("should evaluate to true", () => {
            expect(dimension.isDimensionType()).toBe(true);
          });
        });

        describe("isValidDimensionType", () => {
          it("should evaluate to true", () => {
            expect(dimension.isValidDimensionType()).toBe(true);
          });
        });

        describe("isVariableType", () => {
          it("should evaluate to false", () => {
            expect(dimension.isVariableType()).toBe(false);
          });
        });

        describe("dimension", () => {
          it("should return the underlying dimension of the template tag", () => {
            const d = dimension.dimension();
            expect(d instanceof FieldDimension).toBe(true);
            expect(d.mbql()).toEqual(["field", PRODUCTS.CATEGORY, null]);
          });

          it("should default to null for a TemplateTagDimension without a query", () => {
            const missingQueryTemplateTag = TemplateTagDimension.parseMBQL(
              templateTagClause,
              metadata,
            );

            expect(missingQueryTemplateTag.dimension()).toBeNull();
          });

          it("should default to null for missing template tag dimension", () => {
            const missingTagTemplateTag = TemplateTagDimension.parseMBQL(
              ["template-tag", "bar"],
              metadata,
              query,
            );

            expect(missingTagTemplateTag.dimension()).toBeNull();
          });
        });

        describe("variable", () => {
          it("should be null since this is a dimension type", () => {
            const variable = dimension.variable();
            expect(variable).toBeNull();
          });
        });

        describe("field", () => {
          it("should return the underlying field of the underlying dimension", () => {
            const field = dimension.field();
            expect(field.id).toEqual(PRODUCTS.CATEGORY);
            expect(field.isCategory()).toBe(true);
          });
        });

        describe("name", () => {
          it("should return the underlying field name", () => {
            expect(dimension.name()).toEqual("CATEGORY");
          });
        });

        describe("tagName", () => {
          it("should return the template tag name", () => {
            expect(dimension.tagName()).toEqual("foo");
          });
        });

        describe("displayName", () => {
          it("should return the display name of the tag", () => {
            expect(dimension.displayName()).toEqual("Foo");
          });
        });

        describe("mbql", () => {
          it("should return the template tag clause", () => {
            expect(dimension.mbql()).toEqual(templateTagClause);
          });
        });

        describe("icon", () => {
          it("should return the icon associated with the underlying field", () => {
            expect(dimension.icon()).toEqual("string");
          });
        });
      });
    });

    describe("variable tag", () => {
      const templateTagClause = ["template-tag", "cat"];
      const query = new NativeQuery(productsTable.question(), {
        database: SAMPLE_DB_ID,
        type: "native",
        native: {
          query: "select * from PRODUCTS where CATEGORY = {{cat}}",
          "template-tags": {
            cat: {
              id: "abc",
              name: "cat",
              "display-name": "Cat",
              type: "text",
            },
          },
        },
      });

      const dimension = Dimension.parseMBQL(templateTagClause, metadata, query);

      describe("STATIC METHODS", () => {
        describe("parseMBQL", () => {
          it("returns a TemplateTagDimension", () => {
            expect(dimension).toBeInstanceOf(TemplateTagDimension);
          });

          it("should return null when not given a template tag clause", () => {
            expect(
              TemplateTagDimension.parseMBQL(["field", 123, null], metadata),
            ).toBeNull();
          });
        });
      });

      describe("INSTANCE METHODS", () => {
        describe("tag", () => {
          it("should return the associated tag object from the native query", () => {
            expect(dimension.tag()).toEqual(query.templateTagsMap().cat);
          });
        });

        describe("isDimensionType", () => {
          it("should evaluate to false", () => {
            expect(dimension.isDimensionType()).toBe(false);
          });
        });

        describe("isVariableType", () => {
          it("should evaluate to true", () => {
            expect(dimension.isVariableType()).toBe(true);
          });
        });

        describe("dimension", () => {
          it("should return null since there is no underlying field dimension", () => {
            const d = dimension.dimension();
            expect(d).toBeNull();
          });
        });

        describe("variable", () => {
          it("should return a TemplateTagVariable instance", () => {
            const variable = dimension.variable();
            expect(variable).toBeInstanceOf(TemplateTagVariable);
            expect(variable.displayName()).toEqual("Cat");
          });
        });

        describe("field", () => {
          it("should return null since there is no underlying field", () => {
            const field = dimension.field();
            expect(field).toBeNull();
          });
        });

        describe("name", () => {
          it("should return the underlying field name", () => {
            expect(dimension.name()).toEqual("cat");
          });
        });

        describe("tagName", () => {
          it("should return the template tag name", () => {
            expect(dimension.tagName()).toEqual("cat");
          });
        });

        describe("displayName", () => {
          it("should return the display name of the tag", () => {
            expect(dimension.displayName()).toEqual("Cat");
          });
        });

        describe("mbql", () => {
          it("should return the template tag clause", () => {
            expect(dimension.mbql()).toEqual(templateTagClause);
          });
        });

        describe("icon", () => {
          it("should return the icon associated with the underlying field", () => {
            expect(dimension.icon()).toEqual("string");
          });
        });
      });
    });

    describe("broken dimension tag", () => {
      const templateTagClause = ["template-tag", "foo"];
      const query = new NativeQuery(productsTable.question(), {
        database: SAMPLE_DB_ID,
        type: "native",
        native: {
          query: "select * from PRODUCTS where {{foo}}",
          "template-tags": {
            foo: {
              id: "5928ca74-ca36-8706-7bed-0143d7646b6a",
              name: "foo",
              "display-name": "Foo",
              type: "dimension",
              "widget-type": "category",
              // this should be defined
              dimension: null,
            },
          },
        },
      });

      const brokenDimension = Dimension.parseMBQL(
        templateTagClause,
        metadata,
        query,
      );

      describe("instance methods", () => {
        describe("isDimensionType", () => {
          it("should evaluate to true", () => {
            expect(brokenDimension.isDimensionType()).toBe(true);
          });
        });

        describe("isValidDimensionType", () => {
          it("should return false", () => {
            expect(brokenDimension.isValidDimensionType()).toBe(false);
          });
        });

        describe("isVariableType", () => {
          it("should evaluate to false", () => {
            expect(brokenDimension.isVariableType()).toBe(false);
          });
        });

        describe("field", () => {
          it("should evaluate to null", () => {
            expect(brokenDimension.field()).toBeNull();
          });
        });

        describe("name", () => {
          it("should evaluate to the tag's name instead of the field's", () => {
            expect(brokenDimension.name()).toEqual("foo");
          });
        });

        describe("icon", () => {
          it("should use a fallback icon", () => {
            expect(brokenDimension.icon()).toEqual("label");
          });
        });
      });
    });
  });
});
