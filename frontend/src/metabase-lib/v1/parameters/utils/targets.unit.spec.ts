import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type Database from "metabase-lib/v1/metadata/Database";
import { convertSavedQuestionToVirtualTable } from "metabase-lib/v1/metadata/utils/saved-questions";
import {
  getParameterColumns,
  getParameterTargetField,
  getTemplateTagFromTarget,
  isParameterVariableTarget,
} from "metabase-lib/v1/parameters/utils/targets";
import type {
  FieldReference,
  ParameterDimensionTarget,
} from "metabase-types/api";
import {
  createMockParameter,
  createMockSavedQuestionsDatabase,
  createMockTemplateTag,
} from "metabase-types/api/mocks";
import {
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

const savedQuestionsDb = createMockSavedQuestionsDatabase();

const metadata = createMockMetadata({
  databases: [createSampleDatabase(), savedQuestionsDb],
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
      it("question - returns columns from source table and implicitly joinable tables", () => {
        const card = createSavedStructuredCard();
        const question = new Question(card, metadata);
        const parameter = undefined;
        const { query, stageIndex, columns } = getParameterColumns(
          question,
          parameter,
        );

        expect(columns).toHaveLength(30);

        const columnsInfos = columns.map(column => {
          return Lib.displayInfo(query, stageIndex, column);
        });

        expect(columnsInfos[0]).toMatchObject({
          table: { displayName: "Orders" },
          longDisplayName: "Created At",
        });
        expect(columnsInfos[9]).toMatchObject({
          table: { displayName: "Products" },
          longDisplayName: "Product → Category",
        });
        expect(columnsInfos[17]).toMatchObject({
          table: { displayName: "People" },
          longDisplayName: "User → Address",
        });
      });

      it("model - returns columns from source table and implicitly joinable tables", () => {
        const card = createStructuredModelCard();
        const metadata = createMockMetadata({
          databases: [createSampleDatabase(), savedQuestionsDb],
          tables: [convertSavedQuestionToVirtualTable(card)],
          questions: [card],
        });
        const question = new Question(card, metadata);
        const parameter = undefined;
        const { query, stageIndex, columns } = getParameterColumns(
          question,
          parameter,
        );

        expect(columns).toHaveLength(30);

        const columnsInfos = columns.map(column => {
          return Lib.displayInfo(query, stageIndex, column);
        });

        expect(columnsInfos[0]).toMatchObject({
          table: { displayName: "Orders" },
          longDisplayName: "Created At",
        });
        expect(columnsInfos[9]).toMatchObject({
          table: { displayName: "Products" },
          longDisplayName: "Product → Category",
        });
        expect(columnsInfos[17]).toMatchObject({
          table: { displayName: "People" },
          longDisplayName: "User → Address",
        });
      });
    });

    describe("unit of time parameter", () => {
      it("no breakouts - returns no columns", () => {
        const card = createSavedStructuredCard();
        const question = new Question(card, metadata);
        const parameter = createUnitOfTimeParameter();
        const { columns } = getParameterColumns(question, parameter);

        expect(columns).toHaveLength(0);
      });

      it("non-date breakout - returns no columns", () => {
        const card = createSavedStructuredCard({
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
        const question = new Question(card, metadata);
        const parameter = createUnitOfTimeParameter();
        const { columns } = getParameterColumns(question, parameter);

        expect(columns).toHaveLength(0);
      });

      it("1 date breakout - returns 1 date column", () => {
        const card = createSavedStructuredCard({
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
        const question = new Question(card, metadata);
        const parameter = createUnitOfTimeParameter();
        const { query, stageIndex, columns } = getParameterColumns(
          question,
          parameter,
        );

        expect(columns).toHaveLength(1);

        const columnsInfos = columns.map(column => {
          return Lib.displayInfo(query, stageIndex, column);
        });

        expect(columnsInfos[0]).toMatchObject({
          table: { displayName: "Orders" },
          longDisplayName: "Created At",
        });
      });

      it("2 date breakouts - returns 2 date columns", () => {
        const card = createSavedStructuredCard({
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
        const question = new Question(card, metadata);
        const parameter = createUnitOfTimeParameter();
        const { query, stageIndex, columns } = getParameterColumns(
          question,
          parameter,
        );

        expect(columns).toHaveLength(2);

        const columnsInfos = columns.map(column => {
          return Lib.displayInfo(query, stageIndex, column);
        });

        expect(columnsInfos[0]).toMatchObject({
          table: { displayName: "Orders" },
          longDisplayName: "Created At",
        });
        expect(columnsInfos[1]).toMatchObject({
          table: { displayName: "Products" },
          longDisplayName: "Product → Created At",
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
