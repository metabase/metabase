import _ from "underscore";

import { createMockMetadata } from "__support__/metadata";
import Question from "metabase-lib/v1/Question";
import {
  checkCanBeModel,
  checkCanRefreshModelCache,
  getModelCacheSchemaName,
  isAdHocModelQuestion,
  getDatasetMetadataCompletenessPercentage,
} from "metabase-lib/v1/metadata/utils/models";
import {
  getMockModelCacheInfo,
  COMMON_DATABASE_FEATURES,
} from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  createNativeModelCard as _createNativeModelCard,
  createSavedNativeCard as _createSavedNativeCard,
  createSavedStructuredCard as _createSavedStructuredCard,
  createStructuredModelCard as _createStructuredModelCard,
  ORDERS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";

function getTemplateTag(tag = {}) {
  return {
    id: "_",
    name: "_",
    "display-name": "_",
    type: "card",
    ...tag,
  };
}

function createSavedNativeCard({ tags = {}, ...rest } = {}) {
  return _createSavedNativeCard({
    ...rest,
    dataset_query: {
      type: "native",
      database: SAMPLE_DB_ID,
      native: {
        query: "select * from orders",
        "template-tags": tags,
      },
    },
  });
}

function createNativeModelCard({ tags = {}, ...rest } = {}) {
  return _createNativeModelCard({
    ...rest,
    dataset_query: {
      type: "native",
      database: SAMPLE_DB_ID,
      native: {
        query: "select * from orders",
        "template-tags": tags,
      },
    },
  });
}

function createSavedStructuredCard({ sourceTable = ORDERS_ID, ...rest } = {}) {
  return _createSavedStructuredCard({
    ...rest,
    dataset_query: {
      type: "query",
      database: SAMPLE_DB_ID,
      query: {
        "source-table": sourceTable,
      },
    },
  });
}

function createStructuredModelCard({ sourceTable = ORDERS_ID, ...rest } = {}) {
  return _createStructuredModelCard({
    ...rest,
    dataset_query: {
      type: "query",
      database: SAMPLE_DB_ID,
      query: {
        "source-table": sourceTable,
      },
    },
  });
}

function setup({ cards, hasNestedQueriesSupport = true } = {}) {
  const features = hasNestedQueriesSupport
    ? COMMON_DATABASE_FEATURES
    : _.without(COMMON_DATABASE_FEATURES, "nested-queries");

  const metadata = createMockMetadata({
    databases: [createSampleDatabase({ features })],
    questions: cards ? cards : [],
  });

  const ordersTable = metadata.table(ORDERS_ID);

  return { metadata, ordersTable };
}

describe("data model utils", () => {
  describe("checkCanBeModel", () => {
    const UNSUPPORTED_TEMPLATE_TAG_TYPES = [
      "text",
      "number",
      "date",
      "dimension",
    ];

    describe("structured queries", () => {
      it("returns true for regular questions", () => {
        const { ordersTable } = setup();
        const question = ordersTable.question();
        expect(checkCanBeModel(question)).toBe(true);
      });

      it("returns true if database does not support nested queries", () => {
        const { ordersTable } = setup({ hasNestedQueriesSupport: false });
        const question = ordersTable.question();
        expect(checkCanBeModel(question)).toBe(true);
      });
    });

    describe("native queries", () => {
      it("returns true if no variables used", () => {
        const card = createSavedNativeCard();
        const { metadata } = setup({ cards: [card] });

        const question = metadata.question(card.id);

        expect(checkCanBeModel(question)).toBe(true);
      });

      it("returns true if database does not support nested queries", () => {
        const card = createSavedNativeCard();
        const { metadata } = setup({
          cards: [card],
          hasNestedQueriesSupport: false,
        });

        const question = metadata.question(card.id);

        expect(checkCanBeModel(question)).toBe(true);
      });
      it("returns true when 'card' variables are used", () => {
        const card = createSavedNativeCard({
          tags: {
            "#5": getTemplateTag({ type: "card" }),
          },
        });
        const { metadata } = setup({ cards: [card] });

        const question = metadata.question(card.id);

        expect(checkCanBeModel(question)).toBe(true);
      });

      UNSUPPORTED_TEMPLATE_TAG_TYPES.forEach(tagType => {
        it(`returns false when '${tagType}' variables are used`, () => {
          const card = createSavedNativeCard({
            tags: {
              foo: getTemplateTag({ type: tagType }),
            },
          });
          const { metadata } = setup({ cards: [card] });

          const question = metadata.question(card.id);

          expect(checkCanBeModel(question)).toBe(false);
        });
      });

      it("returns false if at least one unsupported variable type is used", () => {
        const card = createSavedNativeCard({
          tags: {
            "#5": getTemplateTag({ type: "card" }),
            foo: getTemplateTag({ type: "dimension" }),
          },
        });
        const { metadata } = setup({ cards: [card] });

        const question = metadata.question(card.id);

        expect(checkCanBeModel(question)).toBe(false);
      });
    });
  });

  describe("isAdHocModelQuestion", () => {
    it("returns false when original question is not provided", () => {
      const modelCard = createStructuredModelCard({ id: 1 });
      const composedModelCard = createSavedStructuredCard({
        id: 1,
        sourceTable: "card__1",
      });
      const { metadata } = setup({ cards: [modelCard] });
      const question = new Question(composedModelCard, metadata);

      expect(isAdHocModelQuestion(question)).toBe(false);
    });

    it("returns false for native questions", () => {
      const card = createNativeModelCard();
      const { metadata } = setup({ cards: [card] });

      const question = metadata.question(card.id);

      expect(isAdHocModelQuestion(question, question)).toBe(false);
    });

    it("identifies when model goes into ad-hoc exploration mode", () => {
      const modelCard = createStructuredModelCard({ id: 1 });
      const composedModelCard = createSavedStructuredCard({
        id: 1,
        sourceTable: "card__1",
      });
      const { metadata } = setup({ cards: [modelCard] });

      const originalQuestion = metadata.question(modelCard.id);
      const question = new Question(composedModelCard, metadata);

      expect(isAdHocModelQuestion(question, originalQuestion)).toBe(true);
    });

    it("returns false when IDs don't match", () => {
      const modelCard = createStructuredModelCard({ id: 2 });
      const composedModelCard = createSavedStructuredCard({
        id: 1,
        sourceTable: "card__1",
      });
      const { metadata } = setup({ cards: [modelCard] });

      const originalQuestion = metadata.question(modelCard.id);
      const question = new Question(composedModelCard, metadata);

      expect(isAdHocModelQuestion(question, originalQuestion)).toBe(false);
    });

    it("returns false when questions are not models", () => {
      const modelCard = createSavedStructuredCard({ id: 1 });
      const composedModelCard = createSavedStructuredCard({
        id: 1,
        sourceTable: "card__1",
      });
      const { metadata } = setup({ cards: [modelCard] });

      const originalQuestion = metadata.question(modelCard.id);
      const question = new Question(composedModelCard, metadata);

      expect(isAdHocModelQuestion(question, originalQuestion)).toBe(false);
    });

    it("returns false when potential ad-hoc model question is not self-referencing", () => {
      const modelCard = createStructuredModelCard({ id: 1 });
      const composedModelCard = createSavedStructuredCard({
        id: 1,
        sourceTable: ORDERS_ID,
      });
      const { metadata } = setup({ cards: [modelCard] });

      const originalQuestion = metadata.question(modelCard.id);
      const question = new Question(composedModelCard, metadata);

      expect(isAdHocModelQuestion(question, originalQuestion)).toBe(false);
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
