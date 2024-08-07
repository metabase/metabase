import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type Database from "metabase-lib/v1/metadata/Database";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import {
  getParameterColumns,
  getParameterTargetField,
  getTemplateTagFromTarget,
  isParameterVariableTarget,
} from "metabase-lib/v1/parameters/utils/targets";
import type {
  Card,
  FieldReference,
  ParameterDimensionTarget,
  StructuredDatasetQuery,
} from "metabase-types/api";
import {
  createMockField,
  createMockParameter,
  createMockSavedQuestionsDatabase,
  createMockTable,
  createMockTemplateTag,
} from "metabase-types/api/mocks";
import {
  createOrdersCreatedAtField,
  createOrdersQuantityField,
  createOrdersTable,
  createProductsCreatedAtField,
  createSampleDatabase,
  createSavedStructuredCard,
  createStructuredModelCard,
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import { isDimensionTarget } from "metabase-types/guards";

type StructuredCard = Card<StructuredDatasetQuery>;

const sampleDb = createSampleDatabase();
const savedQuestionsDb = createMockSavedQuestionsDatabase();

const metadata = createMockMetadata({
  databases: [sampleDb, savedQuestionsDb],
});

const db = metadata.database(SAMPLE_DB_ID) as Database;

const ordersQuantityField: FieldReference = [
  "field",
  ORDERS.QUANTITY,
  {
    "base-type": "type/Integer",
  },
];

const ordersCreatedAtField: FieldReference = [
  "field",
  ORDERS.CREATED_AT,
  {
    "base-type": "type/DateTime",
  },
];

const ordersCreatedAtMonthField: FieldReference = [
  "field",
  ORDERS.CREATED_AT,
  {
    "base-type": "type/DateTime",
    "temporal-unit": "month",
  },
];

const ordersCreatedAtYearField: FieldReference = [
  "field",
  ORDERS.CREATED_AT,
  {
    "base-type": "type/DateTime",
    "temporal-unit": "year",
  },
];

const productsCreatedAtField: FieldReference = [
  "field",
  PRODUCTS.CREATED_AT,
  {
    "base-type": "type/DateTime",
  },
];

describe("parameters/utils/targets", () => {
  describe("isDimensionTarget", () => {
    it("should return false for non-dimension targets", () => {
      expect(isDimensionTarget(["variable", ["template-tag", "foo"]])).toBe(
        false,
      );
    });

    it('should return true for a target that contains a "dimension" string in the first entry', () => {
      expect(isDimensionTarget(["dimension", ["field", 1, null]])).toBe(true);
      expect(isDimensionTarget(["dimension", ["template-tag", "foo"]])).toBe(
        true,
      );
    });
  });

  describe("isVariableTarget", () => {
    it("should return false for non-variable targets", () => {
      expect(isParameterVariableTarget(["dimension", ["field", 1, null]])).toBe(
        false,
      );
      expect(
        isParameterVariableTarget(["dimension", ["template-tag", "foo"]]),
      ).toBe(false);
    });

    it("should return true for a variable target", () => {
      expect(
        isParameterVariableTarget(["variable", ["template-tag", "foo"]]),
      ).toBe(true);
    });
  });

  describe("getTemplateTagFromTarget", () => {
    it("should return the tag of a template tag target", () => {
      expect(
        getTemplateTagFromTarget(["variable", ["template-tag", "foo"]]),
      ).toBe("foo");
      expect(
        getTemplateTagFromTarget(["dimension", ["template-tag", "bar"]]),
      ).toBe("bar");
    });

    it("should return null for targets that are not template tags", () => {
      expect(
        getTemplateTagFromTarget(["dimension", ["field", 123, null]]),
      ).toBe(null);
    });
  });

  describe("getParameterTargetField", () => {
    it("should return null when the target is not a dimension", () => {
      const question = db.nativeQuestion({
        query: "select * from PRODUCTS where CATEGORY = {{foo}}",
        "template-tags": {
          foo: createMockTemplateTag({
            type: "text",
          }),
        },
      });
      const parameter = createMockParameter();

      expect(
        getParameterTargetField(question, parameter, [
          "variable",
          ["template-tag", "foo"],
        ]),
      ).toBe(null);
    });

    it("should return the mapped field behind a template tag field filter", () => {
      const target: ParameterDimensionTarget = [
        "dimension",
        ["template-tag", "foo"],
      ];
      const question = db.nativeQuestion({
        query: "select * from PRODUCTS where {{foo}}",
        "template-tags": {
          foo: createMockTemplateTag({
            type: "dimension",
            dimension: ["field", PRODUCTS.CATEGORY, null],
          }),
        },
      });
      const parameter = createMockParameter();

      expect(getParameterTargetField(question, parameter, target)).toEqual(
        expect.objectContaining({
          id: PRODUCTS.CATEGORY,
        }),
      );
    });

    it("should return the target field", () => {
      const question = db.question({
        "source-table": PRODUCTS_ID,
      });
      const parameter = createMockParameter();
      const target: ParameterDimensionTarget = [
        "dimension",
        ["field", PRODUCTS.CATEGORY, null],
      ];
      expect(getParameterTargetField(question, parameter, target)).toEqual(
        expect.objectContaining({
          id: PRODUCTS.CATEGORY,
        }),
      );
    });
  });

  describe("getParameterColumns", () => {
    describe("no parameter", () => {
      const parameter = undefined;

      describe("question", () => {
        it("returns columns from source table and implicitly joinable tables", () => {
          const question = createQuestion();
          const { query, stageIndex, columns } = getParameterColumns(
            question,
            parameter,
          );
          const columnsInfos = getColumnsInfos(query, stageIndex, columns);

          expect(columnsInfos).toEqual([
            ["Orders", "Created At"],
            ["Orders", "Discount"],
            ["Orders", "ID"],
            ["Orders", "Product ID"],
            ["Orders", "Quantity"],
            ["Orders", "Subtotal"],
            ["Orders", "Tax"],
            ["Orders", "Total"],
            ["Orders", "User ID"],
            ["Products", "Product → Category"],
            ["Products", "Product → Created At"],
            ["Products", "Product → Ean"],
            ["Products", "Product → ID"],
            ["Products", "Product → Price"],
            ["Products", "Product → Rating"],
            ["Products", "Product → Title"],
            ["Products", "Product → Vendor"],
            ["People", "User → Address"],
            ["People", "User → Birth Date"],
            ["People", "User → City"],
            ["People", "User → Created At"],
            ["People", "User → Email"],
            ["People", "User → ID"],
            ["People", "User → Latitude"],
            ["People", "User → Longitude"],
            ["People", "User → Name"],
            ["People", "User → Password"],
            ["People", "User → Source"],
            ["People", "User → State"],
            ["People", "User → Zip"],
          ]);
        });
      });

      describe("model", () => {
        it("returns columns from source table and implicitly joinable tables", () => {
          const question = createModel({
            result_metadata: createOrdersTable().fields,
          });
          const { query, stageIndex, columns } = getParameterColumns(
            question,
            parameter,
          );
          const columnsInfos = getColumnsInfos(query, stageIndex, columns);

          expect(columnsInfos).toEqual([
            ["Question", "ID"],
            ["Question", "User ID"],
            ["Question", "Product ID"],
            ["Question", "Subtotal"],
            ["Question", "Tax"],
            ["Question", "Total"],
            ["Question", "Discount"],
            ["Question", "Created At"],
            ["Question", "Quantity"],
            ["People", "User → Address"],
            ["People", "User → Birth Date"],
            ["People", "User → City"],
            ["People", "User → Created At"],
            ["People", "User → Email"],
            ["People", "User → ID"],
            ["People", "User → Latitude"],
            ["People", "User → Longitude"],
            ["People", "User → Name"],
            ["People", "User → Password"],
            ["People", "User → Source"],
            ["People", "User → State"],
            ["People", "User → Zip"],
            ["Products", "Product → Category"],
            ["Products", "Product → Created At"],
            ["Products", "Product → Ean"],
            ["Products", "Product → ID"],
            ["Products", "Product → Price"],
            ["Products", "Product → Rating"],
            ["Products", "Product → Title"],
            ["Products", "Product → Vendor"],
          ]);
        });
      });
    });

    describe("unit of time parameter", () => {
      const parameter = createUnitOfTimeParameter();

      describe("question", () => {
        it("no breakouts - returns no columns", () => {
          const question = createQuestion();
          const { columns } = getParameterColumns(question, parameter);

          expect(columns).toHaveLength(0);
        });

        it("non-date breakout - returns no columns", () => {
          const question = createQuestion({
            dataset_query: {
              type: "query",
              database: SAMPLE_DB_ID,
              query: {
                "source-table": ORDERS_ID,
                aggregation: [["count"]],
                breakout: [ordersQuantityField],
              },
            },
          });
          const { columns } = getParameterColumns(question, parameter);

          expect(columns).toHaveLength(0);
        });

        it("1 date breakout - returns 1 date column", () => {
          const question = createQuestion({
            dataset_query: {
              type: "query",
              database: SAMPLE_DB_ID,
              query: {
                "source-table": ORDERS_ID,
                aggregation: [["count"]],
                breakout: [ordersCreatedAtField],
              },
            },
          });
          const { query, stageIndex, columns } = getParameterColumns(
            question,
            parameter,
          );
          const columnsInfos = getColumnsInfos(query, stageIndex, columns);

          expect(columnsInfos).toEqual([["Orders", "Created At"]]);
        });

        it("2 date breakouts - returns 2 date columns", () => {
          const question = createQuestion({
            dataset_query: {
              type: "query",
              database: SAMPLE_DB_ID,
              query: {
                "source-table": ORDERS_ID,
                aggregation: [["count"]],
                breakout: [ordersCreatedAtField, productsCreatedAtField],
              },
            },
          });
          const { query, stageIndex, columns } = getParameterColumns(
            question,
            parameter,
          );
          const columnsInfos = getColumnsInfos(query, stageIndex, columns);

          expect(columnsInfos).toEqual([
            ["Orders", "Created At"],
            ["Products", "Product → Created At"],
          ]);
        });

        it("date breakouts in multiple stages - returns date column from the last stage only", () => {
          const question = createQuestion({
            dataset_query: {
              type: "query",
              database: SAMPLE_DB_ID,
              query: {
                aggregation: [["count"]],
                breakout: [ordersCreatedAtYearField],
                "source-query": {
                  "source-table": ORDERS_ID,
                  aggregation: [["count"]],
                  breakout: [ordersCreatedAtMonthField],
                },
              },
            },
          });
          const { query, stageIndex, columns } = getParameterColumns(
            question,
            parameter,
          );
          const columnsInfos = getColumnsInfos(query, stageIndex, columns);

          expect(columnsInfos).toEqual([["Orders", "Created At: Month"]]);
        });
      });

      describe("model", () => {
        it("no breakouts - returns no columns", () => {
          const question = createModel({
            result_metadata: createOrdersTable().fields,
          });
          const { columns } = getParameterColumns(question, parameter);

          expect(columns).toHaveLength(0);
        });

        it("non-date breakout - returns no columns", () => {
          const question = createModel({
            dataset_query: {
              type: "query",
              database: SAMPLE_DB_ID,
              query: {
                "source-table": ORDERS_ID,
                aggregation: [["count"]],
                breakout: [ordersQuantityField],
              },
            },
            result_metadata: [createOrdersQuantityField(), createCountField()],
          });
          const { columns } = getParameterColumns(question, parameter);

          expect(columns).toHaveLength(0);
        });

        it("1 date breakout - returns 1 date column", () => {
          const question = createModel({
            dataset_query: {
              type: "query",
              database: SAMPLE_DB_ID,
              query: {
                "source-table": ORDERS_ID,
                aggregation: [["count"]],
                breakout: [ordersCreatedAtField],
              },
            },
            result_metadata: [createOrdersCreatedAtField(), createCountField()],
          });
          const { columns } = getParameterColumns(question, parameter);

          expect(columns).toHaveLength(0);
        });

        it("2 date breakouts - returns 2 date columns", () => {
          const question = createModel({
            dataset_query: {
              type: "query",
              database: SAMPLE_DB_ID,
              query: {
                "source-table": ORDERS_ID,
                aggregation: [["count"]],
                breakout: [ordersCreatedAtField, productsCreatedAtField],
              },
            },
            result_metadata: [
              createOrdersCreatedAtField(),
              createProductsCreatedAtField(),
              createCountField(),
            ],
          });
          const { columns } = getParameterColumns(question, parameter);

          expect(columns).toHaveLength(0);
        });

        it("date breakouts in multiple stages - returns date column from the last stage only", () => {
          const question = createModel({
            dataset_query: {
              type: "query",
              database: SAMPLE_DB_ID,
              query: {
                aggregation: [["count"]],
                breakout: [ordersCreatedAtYearField],
                "source-query": {
                  "source-table": ORDERS_ID,
                  aggregation: [["count"]],
                  breakout: [ordersCreatedAtMonthField],
                },
              },
            },
            result_metadata: [createOrdersCreatedAtField(), createCountField()],
          });
          const { columns } = getParameterColumns(question, parameter);

          expect(columns).toHaveLength(0);
        });
      });
    });

    describe("date parameter", () => {
      const parameter = createDateParameter();

      describe("question", () => {
        it("returns date columns from source table and implicitly joinable tables", () => {
          const question = createQuestion();
          const { query, stageIndex, columns } = getParameterColumns(
            question,
            parameter,
          );
          const columnsInfos = getColumnsInfos(query, stageIndex, columns);

          expect(columnsInfos).toEqual([
            ["Orders", "Created At"],
            ["Products", "Product → Created At"],
            ["People", "User → Birth Date"],
            ["People", "User → Created At"],
          ]);
        });
      });

      describe("model", () => {
        it("returns date columns from source table and implicitly joinable tables", () => {
          const question = createModel({
            result_metadata: createOrdersTable().fields,
          });
          const { query, stageIndex, columns } = getParameterColumns(
            question,
            parameter,
          );
          const columnsInfos = getColumnsInfos(query, stageIndex, columns);

          expect(columnsInfos).toEqual([
            ["Question", "Created At"],
            ["People", "User → Birth Date"],
            ["People", "User → Created At"],
            ["Products", "Product → Created At"],
          ]);
        });
      });
    });
  });
});

function createUnitOfTimeParameter() {
  return createMockParameter({
    name: "Unit of Time",
    slug: "unit_of_time",
    id: "49358513",
    type: "temporal-unit",
    sectionId: "temporal-unit",
  });
}

function createDateParameter() {
  return createMockParameter({
    name: "Date",
    slug: "date",
    id: "57ab6554",
    type: "date/all-options",
    sectionId: "date",
  });
}

function createQuestion(opts?: Partial<StructuredCard>) {
  const card = createSavedStructuredCard(opts);

  return new Question(card, metadata);
}

function createCountField() {
  return createMockField({
    display_name: "Count",
    semantic_type: "type/Quantity",
    field_ref: ["aggregation", 0],
    base_type: "type/BigInteger",
    effective_type: "type/BigInteger",
    name: "count",
  });
}

function createModel(opts?: Partial<StructuredCard>) {
  const card = createStructuredModelCard(opts);
  const metadata = createMockMetadata({
    databases: [sampleDb, savedQuestionsDb],
    tables: [getModelVirtualTable(card)],
    questions: [card],
  });

  return new Question(card, metadata);
}

function getModelVirtualTable(card: Card) {
  return createMockTable({
    id: getQuestionVirtualTableId(card.id),
    db_id: savedQuestionsDb.id,
    name: card.name,
    display_name: card.name,
    fields: card.result_metadata,
  });
}

function getColumnsInfos(
  query: Lib.Query,
  stageIndex: number,
  columns: Lib.ColumnMetadata[],
) {
  return columns.map(column => {
    const info = Lib.displayInfo(query, stageIndex, column);
    return [info.table?.displayName, info.longDisplayName];
  });
}
