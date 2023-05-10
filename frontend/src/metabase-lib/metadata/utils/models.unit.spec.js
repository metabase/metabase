import { createMockMetadata } from "__support__/metadata";
import {
  createMockDatabase,
  getMockModelCacheInfo,
} from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  ORDERS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import Question from "metabase-lib/Question";
import Database from "metabase-lib/metadata/Database";

import {
  checkCanBeModel,
  checkCanRefreshModelCache,
  getModelCacheSchemaName,
  isAdHocModelQuestion,
  isAdHocModelQuestionCard,
  getDatasetMetadataCompletenessPercentage,
} from "metabase-lib/metadata/utils/models";

const noNestedQueriesDB = createMockDatabase({
  id: SAMPLE_DB_ID + 1,
  features: [],
});

const metadata = createMockMetadata({
  databases: [createSampleDatabase(), noNestedQueriesDB],
});

describe("data model utils", () => {
  const ordersTable = metadata.table(ORDERS_ID);
  const DB_WITHOUT_NESTED_QUERIES_SUPPORT = new Database(noNestedQueriesDB);

  describe("checkCanBeModel", () => {
    const UNSUPPORTED_TEMPLATE_TAG_TYPES = [
      "text",
      "number",
      "date",
      "dimension",
    ];

    describe("structured queries", () => {
      it("returns true for regular questions", () => {
        const question = ordersTable.question();
        expect(checkCanBeModel(question)).toBe(true);
      });

      it("returns false if database does not support nested queries", () => {
        const question = ordersTable.question();
        question.query().database = () => DB_WITHOUT_NESTED_QUERIES_SUPPORT;
        expect(checkCanBeModel(question)).toBe(false);
      });
    });

    describe("native queries", () => {
      it("returns true if no variables used", () => {
        const question = getNativeQuestion();
        expect(checkCanBeModel(question)).toBe(true);
      });

      it("returns false if database does not support nested queries", () => {
        const question = getNativeQuestion();
        question.query().database = () => DB_WITHOUT_NESTED_QUERIES_SUPPORT;

        expect(checkCanBeModel(question)).toBe(false);
      });
      it("returns true when 'card' variables are used", () => {
        const question = getNativeQuestion({
          tags: {
            "#5": getTemplateTag({ type: "card" }),
          },
        });
        expect(checkCanBeModel(question)).toBe(true);
      });

      UNSUPPORTED_TEMPLATE_TAG_TYPES.forEach(tagType => {
        it(`returns false when '${tagType}' variables are used`, () => {
          const question = getNativeQuestion({
            tags: {
              foo: getTemplateTag({ type: tagType }),
            },
          });
          expect(checkCanBeModel(question)).toBe(false);
        });
      });

      it("returns false if at least one unsupported variable type is used", () => {
        const question = getNativeQuestion({
          tags: {
            "#5": getTemplateTag({ type: "card" }),
            foo: getTemplateTag({ type: "dimension" }),
          },
        });
        expect(checkCanBeModel(question)).toBe(false);
      });
    });
  });

  describe("isAdHocModelQuestion & isAdHocModelQuestionCard", () => {
    it("returns false when original question is not provided", () => {
      const question = getStructuredQuestion({
        id: 1,
        sourceTable: "card__1",
        isModel: true,
      });

      expect(isAdHocModelQuestion(question)).toBe(false);
      expect(isAdHocModelQuestionCard(question.card())).toBe(false);
    });

    it("returns false for native questions", () => {
      const question = getNativeQuestion({ isModel: true });
      const card = question.card();

      expect(isAdHocModelQuestion(question, question)).toBe(false);
      expect(isAdHocModelQuestionCard(card, card)).toBe(false);
    });

    it("identifies when model goes into ad-hoc exploration mode", () => {
      const originalQuestion = getStructuredQuestion({
        id: 1,
        isModel: true,
        sourceTable: 1,
      });
      const question = getStructuredQuestion({
        id: 1,
        isModel: false,
        sourceTable: "card__1",
      });

      expect(isAdHocModelQuestion(question, originalQuestion)).toBe(true);
      expect(
        isAdHocModelQuestionCard(question.card(), originalQuestion.card()),
      ).toBe(true);
    });

    it("returns false when IDs don't match", () => {
      const originalQuestion = getStructuredQuestion({
        id: 2,
        isModel: true,
        sourceTable: 1,
      });
      const question = getStructuredQuestion({
        id: 1,
        isModel: false,
        sourceTable: "card__1",
      });

      expect(isAdHocModelQuestion(question, originalQuestion)).toBe(false);
      expect(
        isAdHocModelQuestionCard(question.card(), originalQuestion.card()),
      ).toBe(false);
    });

    it("returns false when questions are not marked as models", () => {
      const originalQuestion = getStructuredQuestion({
        id: 1,
        isModel: false,
        sourceTable: 1,
      });
      const question = getStructuredQuestion({
        id: 1,
        isModel: false,
        sourceTable: "card__1",
      });

      expect(isAdHocModelQuestion(question, originalQuestion)).toBe(false);
      expect(
        isAdHocModelQuestionCard(question.card(), originalQuestion.card()),
      ).toBe(false);
    });

    it("returns false when potential ad-hoc model question is not self-referencing", () => {
      const originalQuestion = getStructuredQuestion({
        id: 1,
        isModel: true,
        sourceTable: 1,
      });
      const question = getStructuredQuestion({
        id: 1,
        isModel: false,
        sourceTable: 1,
      });

      expect(isAdHocModelQuestion(question, originalQuestion)).toBe(false);
      expect(
        isAdHocModelQuestionCard(question.card(), originalQuestion.card()),
      ).toBe(false);
    });
  });

  describe("checkCanRefreshModelCache", () => {
    const testCases = {
      creating: false,
      refreshing: false,
      persisted: true,
      error: true,
      deletable: false,
      off: false,
    };
    const states = Object.keys(testCases);

    states.forEach(state => {
      const canRefresh = testCases[state];
      it(`returns '${canRefresh}' for '${state}' caching state`, () => {
        const info = getMockModelCacheInfo({ state });
        expect(checkCanRefreshModelCache(info)).toBe(canRefresh);
      });
    });
  });

  describe("getModelCacheSchemaName", () => {
    const DB_ID = 9;
    const SITE_UUID = "143dd8ce-e116-4c7f-8d6d-32e99eaefbbc";

    it("generates correct schema name", () => {
      expect(getModelCacheSchemaName(DB_ID, SITE_UUID)).toBe(
        `metabase_cache_1e483_${DB_ID}`,
      );
    });
  });

  describe("getDatasetMetadataCompletenessPercentage", () => {
    it("returns 0 when no field metadata list is empty", () => {
      expect(getDatasetMetadataCompletenessPercentage([])).toBe(0);
    });

    it("returns 0 for completely missing metadata", () => {
      const percent = getDatasetMetadataCompletenessPercentage([
        { display_name: "Created_At" },
        { display_name: "Products → Category" },
      ]);
      expect(percent).toBe(0);
    });

    it("returns 1 for complete metadata", () => {
      const percent = getDatasetMetadataCompletenessPercentage([
        {
          display_name: "Created At",
          description: "Date created",
          semantic_type: "DateTime",
        },
        {
          display_name: "Product Category",
          description: "The name is pretty self-explaining",
          semantic_type: "String",
        },
      ]);
      expect(percent).toBe(1);
    });

    it("returns 0.5 for half-complete metadata", () => {
      const percent = getDatasetMetadataCompletenessPercentage([
        { display_name: "Created_At" },
        {
          display_name: "Product Category",
          description: "The name is pretty self-explaining",
          semantic_type: "String",
        },
      ]);
      expect(percent).toBe(0.5);
    });

    it("returns percent value for partially complete metadata", () => {
      const percent = getDatasetMetadataCompletenessPercentage([
        { display_name: "Created_At" },
        {
          display_name: "Product Category",
          semantic_type: "String",
        },
      ]);
      expect(percent).toBe(0.33);
    });
  });
});

function getNativeQuestion({ tags = {}, isModel } = {}) {
  return new Question(
    {
      id: 1,
      dataset: isModel,
      display: "table",
      can_write: true,
      public_uuid: "",
      dataset_query: {
        type: "native",
        database: 1,
        native: {
          query: "select * from orders",
          "template-tags": tags,
        },
      },
      visualization_settings: {},
    },
    metadata,
  );
}

function getStructuredQuestion({
  id = 1,
  sourceTable = 1,
  isModel = false,
} = {}) {
  return new Question(
    {
      id,
      dataset: isModel,
      display: "table",
      can_write: true,
      public_uuid: "",
      dataset_query: {
        type: "query",
        database: 1,
        query: {
          "source-table": sourceTable,
        },
      },
      visualization_settings: {},
    },
    metadata,
  );
}

function getTemplateTag(tag = {}) {
  return {
    id: "_",
    name: "_",
    "display-name": "_",
    type: "card",
    ...tag,
  };
}
