import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";
import { createQuery, createQueryWithClauses } from "metabase-lib/test-helpers";
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
  ParameterDimensionTarget,
  StructuredDatasetQuery,
} from "metabase-types/api";
import {
  createMockCard,
  createMockField,
  createMockParameter,
  createMockSavedQuestionsDatabase,
  createMockTable,
  createMockTemplateTag,
} from "metabase-types/api/mocks";
import {
  PRODUCTS,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
  createOrdersCreatedAtField,
  createOrdersQuantityField,
  createOrdersTable,
  createProductsCreatedAtField,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import { isDimensionTarget } from "metabase-types/guards";

type StructuredCard = Card<StructuredDatasetQuery>;

const sampleDb = createSampleDatabase();
const savedQuestionsDb = createMockSavedQuestionsDatabase();

const metadata = createMockMetadata({
  databases: [sampleDb, savedQuestionsDb],
});

const db = metadata.database(SAMPLE_DB_ID) as Database;

const queryOrders = createQuery();

const queryNonDateBreakout = createQueryWithClauses({
  aggregations: [{ operatorName: "count" }],
  breakouts: [{ tableName: "ORDERS", columnName: "QUANTITY" }],
});

const query1DateBreakout = createQueryWithClauses({
  aggregations: [{ operatorName: "count" }],
  breakouts: [
    {
      tableName: "ORDERS",
      columnName: "CREATED_AT",
      temporalBucketName: "Month",
    },
  ],
});

const query2DateBreakouts = createQueryWithClauses({
  aggregations: [{ operatorName: "count" }],
  breakouts: [
    {
      tableName: "ORDERS",
      columnName: "CREATED_AT",
      temporalBucketName: "Month",
    },
    {
      tableName: "PRODUCTS",
      columnName: "CREATED_AT",
      temporalBucketName: "Month",
    },
  ],
});

const queryDateBreakoutsMultiStage = createQueryWithClauses({
  query: Lib.appendStage(
    createQueryWithClauses({
      aggregations: [{ operatorName: "count" }],
      breakouts: [
        {
          tableName: "ORDERS",
          columnName: "CREATED_AT",
          temporalBucketName: "Month",
        },
      ],
    }),
  ),
  aggregations: [{ operatorName: "count" }],
  breakouts: [
    {
      tableName: "ORDERS",
      columnName: "CREATED_AT",
      temporalBucketName: "Year",
    },
  ],
});

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
          const question = createQuestion(queryOrders);
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
          const question = createModel(
            queryOrders,
            checkNotNull(createOrdersTable().fields),
          );
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
          const question = createQuestion(queryOrders);
          const { columns } = getParameterColumns(question, parameter);

          expect(columns).toHaveLength(0);
        });

        it("non-date breakout - returns no columns", () => {
          const question = createQuestion(queryNonDateBreakout);
          const { columns } = getParameterColumns(question, parameter);

          expect(columns).toHaveLength(0);
        });

        it("1 date breakout - returns 1 date column", () => {
          const question = createQuestion(query1DateBreakout);
          const { query, stageIndex, columns } = getParameterColumns(
            question,
            parameter,
          );
          const columnsInfos = getColumnsInfos(query, stageIndex, columns);

          expect(columnsInfos).toEqual([["Orders", "Created At"]]);
        });

        it("2 date breakouts - returns 2 date columns", () => {
          const question = createQuestion(query2DateBreakouts);
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
          const question = createQuestion(queryDateBreakoutsMultiStage);
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
          const question = createModel(
            queryOrders,
            checkNotNull(createOrdersTable().fields),
          );
          const { columns } = getParameterColumns(question, parameter);

          expect(columns).toHaveLength(0);
        });

        it("non-date breakout - returns no columns", () => {
          const question = createModel(queryNonDateBreakout, [
            createOrdersQuantityField(),
            createCountField(),
          ]);
          const { columns } = getParameterColumns(question, parameter);

          expect(columns).toHaveLength(0);
        });

        it("1 date breakout - returns 1 date column", () => {
          const question = createModel(query1DateBreakout, [
            createOrdersCreatedAtField(),
            createCountField(),
          ]);
          const { columns } = getParameterColumns(question, parameter);

          expect(columns).toHaveLength(0);
        });

        it("2 date breakouts - returns 2 date columns", () => {
          const question = createModel(query2DateBreakouts, [
            createOrdersCreatedAtField(),
            createProductsCreatedAtField(),
            createCountField(),
          ]);
          const { columns } = getParameterColumns(question, parameter);

          expect(columns).toHaveLength(0);
        });

        it("date breakouts in multiple stages - returns date column from the last stage only", () => {
          const question = createModel(queryDateBreakoutsMultiStage, [
            createOrdersCreatedAtField(),
            createCountField(),
          ]);
          const { columns } = getParameterColumns(question, parameter);

          expect(columns).toHaveLength(0);
        });
      });
    });

    describe("date parameter", () => {
      const parameter = createDateParameter();

      describe("question", () => {
        it("returns date columns from source table and implicitly joinable tables", () => {
          const question = createQuestion(queryOrders);
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
          const question = createModel(
            queryOrders,
            checkNotNull(createOrdersTable().fields),
          );
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
    name: "Time grouping",
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

function createQuestion(query: Lib.Query) {
  return new Question(createMockCard(), metadata).setQuery(query);
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

function createModel(
  query: Lib.Query,
  /* result_metadata needs to be passed, otherwise test setup would be incorrect */
  result_metadata: StructuredCard["result_metadata"],
) {
  const card = createMockCard({ type: "model", result_metadata });
  const metadata = createMockMetadata({
    databases: [sampleDb, savedQuestionsDb],
    tables: [getModelVirtualTable(card)],
    questions: [card],
  });

  return new Question(card, metadata).setQuery(query);
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
