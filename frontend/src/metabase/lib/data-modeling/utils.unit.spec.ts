import MetabaseSettings from "metabase/lib/settings";

import Question from "metabase-lib/lib/Question";
import Database from "metabase-lib/lib/metadata/Database";

import { ModelCacheState } from "metabase-types/api";
import {
  TemplateTag,
  TemplateTagType,
  TemplateTags,
  SourceTableId,
} from "metabase-types/types/Query";
import { CardId } from "metabase-types/types/Card";

import { createMockDatabase } from "metabase-types/api/mocks/database";
import { getMockModelCacheInfo } from "metabase-types/api/mocks/models";
import { ORDERS, metadata } from "__support__/sample_database_fixture";

import {
  checkCanBeModel,
  isAdHocModelQuestion,
  isAdHocModelQuestionCard,
  checkCanRefreshModelCache,
  getModelCacheSchemaName,
} from "./utils";

type NativeQuestionFactoryOpts = {
  isModel?: boolean;
  tags?: TemplateTags;
};

function getNativeQuestion({
  tags = {},
  isModel,
}: NativeQuestionFactoryOpts = {}) {
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

type StructuredQuestionFactoryOpts = {
  id?: CardId;
  sourceTable?: SourceTableId;
  isModel?: boolean;
};

function getStructuredQuestion({
  id = 1,
  sourceTable = 1,
  isModel = false,
}: StructuredQuestionFactoryOpts = {}) {
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

function getTemplateTag(tag: Partial<TemplateTag> = {}): TemplateTag {
  return {
    id: "_",
    name: "_",
    "display-name": "_",
    type: "card",
    ...tag,
  };
}

describe("data model utils", () => {
  const DB_WITHOUT_NESTED_QUERIES_SUPPORT = new Database({
    ...createMockDatabase(),
    features: [],
  });

  describe("checkCanBeModel", () => {
    const UNSUPPORTED_TEMPLATE_TAG_TYPES: TemplateTagType[] = [
      "text",
      "number",
      "date",
      "dimension",
    ];

    describe("structured queries", () => {
      it("returns true for regular questions", () => {
        const question = ORDERS.question();
        expect(checkCanBeModel(question)).toBe(true);
      });

      it("returns false if database does not support nested queries", () => {
        const question = ORDERS.question();
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
    const testCases: Record<ModelCacheState, boolean> = {
      creating: false,
      refreshing: false,
      persisted: true,
      error: true,
      deletable: false,
      off: false,
    };
    const states = Object.keys(testCases) as ModelCacheState[];

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

    beforeEach(() => {
      const defaultGet = MetabaseSettings.get;
      jest.spyOn(MetabaseSettings, "get").mockImplementation(key => {
        if (key === "site-uuid") {
          return "143dd8ce-e116-4c7f-8d6d-32e99eaefbbc";
        }
        return defaultGet(key);
      });
    });

    it("generates correct schema name", () => {
      expect(getModelCacheSchemaName(DB_ID)).toBe(
        `metabase_cache_1e483_${DB_ID}`,
      );
    });
  });
});
