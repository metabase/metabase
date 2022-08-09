import _ from "underscore";
import Dimension, {
  FieldDimension,
  TemplateTagDimension,
} from "metabase-lib/lib/Dimension";
import Field from "metabase-lib/lib/metadata/Field";
import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import Question from "metabase-lib/lib/Question";
import { TemplateTagVariable } from "metabase-lib/lib/Variable";

import {
  metadata,
  ORDERS,
  PRODUCTS,
  SAMPLE_DATABASE,
} from "__support__/sample_database_fixture";

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

const cardWithResultMetadata = {
  id: 123,
  dataset: true,
  display: "table",
  visualization_settings: {},
  dataset_query: {
    type: "query",
    database: SAMPLE_DATABASE.id,
    query: {
      "source-table": ORDERS.id,
    },
  },
  result_metadata: [
    {
      id: ORDERS.ID.id,
      display_name: "Foo",
    },
    {
      name: ORDERS.TOTAL.name,
      display_name: "Bar",
    },
  ],
};

const PRODUCT_CATEGORY_FIELD_ID = 21;

const ORDERS_USER_ID_FIELD = metadata.field(ORDERS.USER_ID.id).getPlainObject();

const OVERWRITTEN_USER_ID_FIELD_METADATA = {
  ...ORDERS_USER_ID_FIELD,
  display_name: "Foo",
  description: "Bar",
  fk_target_field_id: 1,
  semantic_type: "type/Price",
  settings: {
    show_mini_bar: true,
  },
};

const ORDERS_DATASET = ORDERS.question()
  .setDataset(true)
  .setResultsMetadata({
    columns: [OVERWRITTEN_USER_ID_FIELD_METADATA],
  });
ORDERS_DATASET.card().id = 111;

// It isn't actually possible to overwrite metadata for non-models,
// it's just needed to test it's only possible for models
const ORDERS_WITH_OVERWRITTEN_METADATA = ORDERS_DATASET.setDataset(false);

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
        it("should return the column", () => {
          expect(dimension.column()).toEqual({
            id: 6,
            name: "TOTAL",
            display_name: "Total",
            base_type: "type/Float",
            semantic_type: "type/Currency",
            field_ref: ["field", ORDERS.TOTAL.id, null],
          });
        });
      });
      describe("field()", () => {
        it("should return correct Field for underlying Field", () => {
          expect(dimension.field().id).toEqual(ORDERS.TOTAL.id);
          expect(dimension.field().metadata).toEqual(metadata);
          expect(dimension.field().displayName()).toEqual("Total");
        });

        it("should return the correct Field from a query's result_metadata when the metadata object is missing the Field", () => {
          const emptyMetadata = {
            field: () => {},
            table: () => {},
            card: () => {},
          };

          const question = ORDERS.question().setResultsMetadata({
            columns: [ORDERS.TOTAL],
          });
          question.card().id = 1;

          const query = new StructuredQuery(question, {
            type: "query",
            database: SAMPLE_DATABASE.id,
            query: {
              "source-table": ORDERS.id,
            },
          });
          const dimension = Dimension.parseMBQL(
            ["field", ORDERS.TOTAL.id, null],
            emptyMetadata,
            query,
          );

          const field = dimension.field();

          expect(field.id).toEqual(ORDERS.TOTAL.id);
          expect(field.base_type).toEqual("type/Float");
        });

        it("should merge model's field results metadata with field info", () => {
          const dimension = Dimension.parseMBQL(
            ["field", ORDERS.USER_ID.id, null],
            metadata,
            ORDERS_DATASET.query(),
          );

          const field = dimension.field();
          const fieldInfo = _.omit(field.getPlainObject(), "metadata", "query");

          expect(fieldInfo).toEqual(OVERWRITTEN_USER_ID_FIELD_METADATA);
        });

        // TODO: confirm that we don't need to worry about this
        it.skip("should not merge regular question's field results metadata with field info", () => {
          const dimension = Dimension.parseMBQL(
            ["field", ORDERS.USER_ID.id, null],
            metadata,
            ORDERS_WITH_OVERWRITTEN_METADATA.query(),
          );

          const field = dimension.field();
          const fieldInfo = _.omit(field.getPlainObject(), "metadata", "query");

          expect(fieldInfo).toEqual(ORDERS_USER_ID_FIELD);
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
        it("should return the column", () => {
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
        it("should return the column", () => {
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
          expect(dimension.mbql()).toEqual(["expression", "Hello World", null]);
        });
      });
      describe("displayName()", () => {
        it("returns the expression name", () => {
          expect(dimension.displayName()).toEqual("Hello World");
        });
      });

      describe("column()", () => {
        expect(dimension.column()).toEqual({
          id: ["expression", "Hello World", null],
          name: "Hello World",
          display_name: "Hello World",
          base_type: "type/Text",
          semantic_type: "type/Text",
          field_ref: ["expression", "Hello World", null],
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
            const query = question.query();
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
            const query = question.query();
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
    });

    describe("dimensions()", () => {
      it("should return subdimensions according to the field type", () => {
        const question = new Question(nestedQuestionCard, metadata);
        const dimension = Dimension.parseMBQL(
          ["expression", 42],
          metadata,
          question.query(),
        );
        expect(dimension.dimensions().length).toEqual(5); // 5 different binnings for a number
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
          expect(dimension.mbql()).toEqual(["aggregation", 1, null]);
        });
      });

      function aggregation(agg) {
        const query = new StructuredQuery(ORDERS.question(), {
          type: "query",
          database: SAMPLE_DATABASE.id,
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

  describe("Nested Question Field Dimension", () => {
    const question = new Question(nestedQuestionCard, metadata);

    const dimension = Dimension.parseMBQL(
      ["field", "boolean", { "base-type": "type/Boolean" }],
      metadata,
      question.query(),
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
            semantic_type: null,
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
          expect(field.id).toBeUndefined();
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
        const fieldFromEndpoint = new Field({
          ...PRODUCTS.CATEGORY.getPlainObject(),
          _comesFromEndpoint: true,
        });

        const fieldDimension = fieldFromEndpoint.dimension();
        expect(fieldDimension._fieldInstance).toBe(fieldFromEndpoint);
        expect(fieldDimension.field()).toBe(fieldFromEndpoint);
      });
    });
  });

  describe("Dimension connected to saved question with result_metadata", () => {
    describe("field", () => {
      it("should return a Field with properties from the field in the question's result_metadata", () => {
        const questionWithResultMetadata = new Question(
          cardWithResultMetadata,
          metadata,
        );
        const fieldDimensionUsingIdProp = Dimension.parseMBQL(
          ["field", ORDERS.ID.id, null],
          metadata,
          questionWithResultMetadata.query(),
        );
        const fieldDimensionUsingNameProp = Dimension.parseMBQL(
          ["field", ORDERS.TOTAL.name, null],
          metadata,
          questionWithResultMetadata.query(),
        );

        const idField = fieldDimensionUsingIdProp.field();
        expect(idField.id).toBe(ORDERS.ID.id);
        expect(idField.display_name).toBe("Foo");
        expect(idField.description).toBe(ORDERS.ID.description);

        const nameField = fieldDimensionUsingNameProp.field();
        expect(nameField.name).toBe(ORDERS.TOTAL.name);
        expect(nameField.display_name).toBe("Bar");
        expect(nameField.id).toBeUndefined();
        expect(nameField.description).toBeUndefined();
      });
    });
  });

  describe("Dimension connected to query based on nested card with result_metadata", () => {
    describe("field", () => {
      it("should return a Field with properties from the field in the question's result_metadata", () => {
        metadata.cards[cardWithResultMetadata.id] = cardWithResultMetadata;

        const questionWithResultMetadata = new Question(
          cardWithResultMetadata,
          metadata,
        );
        const unsavedQuestionBasedOnCard = questionWithResultMetadata
          .composeThisQuery()
          .setResultsMetadata([]);

        const fieldDimensionUsingIdProp = Dimension.parseMBQL(
          ["field", ORDERS.ID.id, null],
          metadata,
          unsavedQuestionBasedOnCard.query(),
        );
        const fieldDimensionUsingNameProp = Dimension.parseMBQL(
          ["field", ORDERS.TOTAL.name, null],
          metadata,
          unsavedQuestionBasedOnCard.query(),
        );

        const idField = fieldDimensionUsingIdProp.field();
        expect(idField.id).toBe(ORDERS.ID.id);
        expect(idField.display_name).toBe("Foo");
        expect(idField.description).toBe(ORDERS.ID.description);

        const nameField = fieldDimensionUsingNameProp.field();
        expect(nameField.name).toBe(ORDERS.TOTAL.name);
        expect(nameField.display_name).toBe("Bar");
        expect(nameField.id).toBeUndefined();
        expect(nameField.description).toBeUndefined();
      });
    });
  });

  describe("TemplateTagDimension", () => {
    describe("dimension tag (ie a field filter)", () => {
      const templateTagClause = ["template-tag", "foo"];
      const query = new NativeQuery(PRODUCTS.question(), {
        database: SAMPLE_DATABASE.id,
        type: "native",
        native: {
          query: "select * from PRODUCTS where {{foo}}",
          "template-tags": {
            foo: {
              id: "5928ca74-ca36-8706-7bed-0143d7646b6a",
              name: "foo",
              "display-name": "Foo",
              type: "dimension",
              dimension: ["field", PRODUCT_CATEGORY_FIELD_ID, null],
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

        describe("isTemplateTagClause", () => {
          it("returns false for a field clause", () => {
            expect(
              TemplateTagDimension.isTemplateTagClause(["field", 123, null]),
            ).toBe(false);
          });

          it("returns false for a non-array clause", () => {
            expect(TemplateTagDimension.isTemplateTagClause("foo")).toBe(false);
          });

          it("returns true for a template tag clause", () => {
            expect(
              TemplateTagDimension.isTemplateTagClause(templateTagClause),
            ).toBe(true);
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
            expect(d.mbql()).toEqual([
              "field",
              PRODUCT_CATEGORY_FIELD_ID,
              null,
            ]);
          });

          it("should default to null for a TemplateTagDimension without a query", () => {
            const missingQueryTemplateTag = TemplateTagDimension.parseMBQL(
              templateTagClause,
              metadata,
            );

            expect(missingQueryTemplateTag.dimension()).toBeNull();
          });

          it("should default to null for a TemplateTagDimension without a query", () => {
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
            expect(field.id).toEqual(PRODUCT_CATEGORY_FIELD_ID);
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
      const query = new NativeQuery(PRODUCTS.question(), {
        database: SAMPLE_DATABASE.id,
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

        describe("isTemplateTagClause", () => {
          it("returns false for a field clause", () => {
            expect(
              TemplateTagDimension.isTemplateTagClause(["field", 123, null]),
            ).toBe(false);
          });

          it("returns false for a non-array clause", () => {
            expect(TemplateTagDimension.isTemplateTagClause("foo")).toBe(false);
          });

          it("returns true for a template tag clause", () => {
            expect(
              TemplateTagDimension.isTemplateTagClause(templateTagClause),
            ).toBe(true);
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
      const query = new NativeQuery(PRODUCTS.question(), {
        database: SAMPLE_DATABASE.id,
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
