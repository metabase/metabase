import * as questionActions from "metabase/questions/actions";
import {
  ConcreteFieldReference,
  StructuredDatasetQuery,
  TemplateTag,
  UnsavedCard,
} from "metabase-types/api";
import { createMockDataset } from "metabase-types/api/mocks";
import { QueryBuilderMode } from "metabase-types/store";
import {
  createMockState,
  createMockQueryBuilderState,
  createMockQueryBuilderUIControlsState,
} from "metabase-types/store/mocks";
import {
  SAMPLE_DATABASE,
  ORDERS,
  PEOPLE,
  PRODUCTS,
  state as entitiesState,
  metadata,
} from "__support__/sample_database_fixture";
import Question from "metabase-lib/Question";
import NativeQuery from "metabase-lib/queries/NativeQuery";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";
import Join from "metabase-lib/queries/structured/Join";

import {
  getAdHocQuestion,
  getSavedStructuredQuestion,
  getSavedNativeQuestion,
  getUnsavedNativeQuestion,
  getStructuredModel,
  getNativeModel,
  getComposedModel,
} from "metabase-lib/mocks";
import * as navigation from "../navigation";
import * as native from "../native";
import * as querying from "../querying";

import * as ui from "../ui";
import { updateQuestion, UPDATE_QUESTION } from "./updateQuestion";

type SetupOpts = {
  question: Question;
  originalQuestion?: Question;
  run?: boolean;
  shouldUpdateUrl?: boolean;
  shouldStartAdHocQuestion?: boolean;
  queryBuilderMode?: QueryBuilderMode;
  isShowingTemplateTagsEditor?: boolean;
};

function getDefaultOriginalQuestion(question: Question) {
  if (question.isNative()) {
    const query = question.query() as NativeQuery;
    return query.setQueryText("select * from products limit 5").question();
  }
  const query = question.query() as StructuredQuery;
  return query.filter(["=", ORDERS.TAX.reference(), 5]).question();
}

async function setup({
  question,
  originalQuestion = getDefaultOriginalQuestion(question),
  queryBuilderMode = "view",
  isShowingTemplateTagsEditor = false,
  run,
  shouldUpdateUrl,
  shouldStartAdHocQuestion,
}: SetupOpts) {
  if (originalQuestion.id()) {
    metadata.questions = {
      [originalQuestion.id()]: originalQuestion,
    };
  }

  const dispatch = jest.fn().mockReturnValue({ mock: "mock" });

  const queryResult = createMockDataset({
    data: {
      cols: ORDERS.fields.map(field => field.column()),
    },
  });

  const qbState = createMockQueryBuilderState({
    card: originalQuestion.card(),
    queryResults: [queryResult],
    uiControls: createMockQueryBuilderUIControlsState({
      queryBuilderMode,
      isShowingTemplateTagsEditor,
    }),
  });

  const getState = () => ({
    ...createMockState(),
    ...entitiesState,
    qb: qbState,
  });

  await updateQuestion(question, {
    run,
    shouldUpdateUrl,
    shouldStartAdHocQuestion,
  })(dispatch, getState);

  const actions = dispatch.mock.calls.find(
    call => call[0]?.type === UPDATE_QUESTION,
  );
  const hasDispatchedInitAction = Array.isArray(actions);
  const result = hasDispatchedInitAction ? actions[0].payload : null;

  return { dispatch, result };
}

const PRODUCTS_JOIN_CLAUSE = {
  alias: "Products",
  condition: [
    "=",
    ORDERS.PRODUCT_ID.reference(),
    ["field", PRODUCTS.ID, { "join-alias": "Products" }],
  ],
  "source-table": PRODUCTS.id,
};

const PIVOT_TABLE_ORDER_CREATED_AT_FIELD: ConcreteFieldReference = [
  "field",
  ORDERS.CREATED_AT.id,
  { "temporal-unit": "year" },
];

const PIVOT_TABLE_PEOPLE_SOURCE_FIELD: ConcreteFieldReference = [
  "field",
  PEOPLE.SOURCE.id,
  { "source-field": ORDERS.USER_ID.id },
];

const PIVOT_TABLE_PRODUCT_CATEGORY_FIELD: ConcreteFieldReference = [
  "field",
  PRODUCTS.CATEGORY.id,
  { "source-field": ORDERS.PRODUCT_ID.id },
];

const PIVOT_TABLE_QUESTION: UnsavedCard<StructuredDatasetQuery> = {
  display: "pivot",
  dataset_query: {
    type: "query",
    database: SAMPLE_DATABASE?.id,
    query: {
      "source-table": ORDERS.id,
      aggregation: [["count"]],
      breakout: [
        PIVOT_TABLE_ORDER_CREATED_AT_FIELD,
        PIVOT_TABLE_PEOPLE_SOURCE_FIELD,
        PIVOT_TABLE_PRODUCT_CATEGORY_FIELD,
      ],
    },
  },
  visualization_settings: {
    "pivot_table.column_split": {
      columns: [PIVOT_TABLE_PRODUCT_CATEGORY_FIELD],
      rows: [
        PIVOT_TABLE_PEOPLE_SOURCE_FIELD,
        PIVOT_TABLE_ORDER_CREATED_AT_FIELD,
      ],
      values: [["aggregation", 0]],
    },
  },
};

describe("QB Actions > updateQuestion", () => {
  beforeAll(() => {
    console.warn = jest.fn();
    console.error = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const TEST_CASE = {
    SAVED_STRUCTURED_QUESTION: {
      question: getSavedStructuredQuestion(),
      questionType: "saved structured question",
    },
    UNSAVED_STRUCTURED_QUESTION: {
      question: getAdHocQuestion(),
      questionType: "ad-hoc structured question",
    },

    SAVED_NATIVE_QUESTION: {
      question: getSavedNativeQuestion(),
      questionType: "saved native question",
    },
    UNSAVED_NATIVE_QUESTION: {
      question: getUnsavedNativeQuestion(),
      questionType: "unsaved native question",
    },

    STRUCTURED_MODEL: {
      question: getStructuredModel(),
      questionType: "structured model",
    },
    NATIVE_MODEL: {
      question: getNativeModel(),
      questionType: "native model",
    },
    COMPOSED_MODEL: {
      question: getComposedModel(),
      questionType: "model",
    },
  };

  const ALL_TEST_CASES = Object.values(TEST_CASE);

  const SAVED_QUESTION_TEST_CASES = [
    TEST_CASE.SAVED_STRUCTURED_QUESTION,
    TEST_CASE.SAVED_NATIVE_QUESTION,
  ];

  const MODEL_TEST_CASES = [
    TEST_CASE.STRUCTURED_MODEL,
    TEST_CASE.NATIVE_MODEL,
    TEST_CASE.COMPOSED_MODEL,
  ];

  const STRUCTURED_TEST_CASES = [
    TEST_CASE.SAVED_STRUCTURED_QUESTION,
    TEST_CASE.UNSAVED_STRUCTURED_QUESTION,
    TEST_CASE.COMPOSED_MODEL,
  ];

  const NATIVE_TEST_CASES = [
    TEST_CASE.SAVED_NATIVE_QUESTION,
    TEST_CASE.UNSAVED_NATIVE_QUESTION,
  ];

  describe("common", () => {
    ALL_TEST_CASES.forEach(testCase => {
      const { question, questionType } = testCase;

      describe(questionType, () => {
        it("runs query if `run: true` option provided", async () => {
          jest.spyOn(Question.prototype, "canAutoRun").mockReturnValue(true);
          const runQuerySpy = jest.spyOn(querying, "runQuestionQuery");

          await setup({ question, run: true });

          expect(runQuerySpy).toHaveBeenCalledTimes(1);
        });

        it("doesn't run query if `run: false` option provided", async () => {
          jest.spyOn(Question.prototype, "canAutoRun").mockReturnValue(true);
          const runQuerySpy = jest.spyOn(querying, "runQuestionQuery");

          await setup({ question, run: false });

          expect(runQuerySpy).not.toHaveBeenCalled();
        });

        it("doesn't run query if question can't be run automatically", async () => {
          jest.spyOn(Question.prototype, "canAutoRun").mockReturnValue(false);
          const runQuerySpy = jest.spyOn(querying, "runQuestionQuery");

          await setup({ question, run: true });

          expect(runQuerySpy).not.toHaveBeenCalled();
        });

        it("updates URL if `shouldUpdateUrl: true` option provided", async () => {
          const updateUrlSpy = jest.spyOn(navigation, "updateUrl");
          await setup({ question, shouldUpdateUrl: true });
          expect(updateUrlSpy).toHaveBeenCalledTimes(1);
        });

        it("doesn't update URL if `shouldUpdateUrl: false` option provided", async () => {
          const updateUrlSpy = jest.spyOn(navigation, "updateUrl");
          await setup({ question, shouldUpdateUrl: false });
          expect(updateUrlSpy).not.toHaveBeenCalled();
        });
      });
    });
  });

  describe("saved questions and models", () => {
    describe("common", () => {
      [...SAVED_QUESTION_TEST_CASES, ...MODEL_TEST_CASES].forEach(testCase => {
        const { question, questionType } = testCase;

        describe(questionType, () => {
          it("turns question into ad-hoc", async () => {
            const { result } = await setup({ question });
            expect(result.card.id).toBeUndefined();
            expect(result.card.name).toBeUndefined();
            expect(result.card.description).toBeUndefined();
            expect(result.card.dataset_query).toEqual(question.datasetQuery());
            expect(result.card.visualization_settings).toEqual(
              question.settings(),
            );
          });

          it("doesn't turn question into ad-hoc if `shouldStartAdHocQuestion` option is disabled", async () => {
            const { result } = await setup({
              question,
              shouldStartAdHocQuestion: false,
            });

            expect(result.card.id).toBe(question.id());
            expect(result.card.name).toBe(question.displayName());
            expect(result.card.description).toBe(question.description());
            expect(result.card.dataset_query).toEqual(question.datasetQuery());
            expect(result.card.visualization_settings).toEqual(
              question.settings(),
            );
          });
        });
      });
    });

    describe("structured questions and models", () => {
      [TEST_CASE.SAVED_STRUCTURED_QUESTION, TEST_CASE.STRUCTURED_MODEL].forEach(
        testCase => {
          const { question, questionType } = testCase;

          describe(questionType, () => {
            it("doesn't turn read-only questions into ad-hoc", async () => {
              const readOnly = question.clone();
              readOnly.query().isEditable = () => false;
              readOnly.query().readOnly = () => true;

              const { result } = await setup({ question: readOnly });

              expect(result.card).toEqual(readOnly.card());
            });
          });
        },
      );
    });

    describe("native questions and models", () => {
      [TEST_CASE.SAVED_NATIVE_QUESTION, TEST_CASE.NATIVE_MODEL].forEach(
        testCase => {
          const { question, questionType } = testCase;

          describe(questionType, () => {
            it("doesn't turn read-only questions into ad-hoc", async () => {
              const readOnly = question.clone();
              readOnly.query().isEditable = () => false;
              readOnly.query().readOnly = () => true;

              const { result } = await setup({ question: readOnly });

              expect(result.card).toEqual({
                ...readOnly.card(),
                parameters: [],
              });
            });
          });
        },
      );
    });
  });

  describe("saved questions", () => {
    SAVED_QUESTION_TEST_CASES.forEach(testCase => {
      const { question, questionType } = testCase;

      describe(questionType, () => {
        it("triggers question details sidebar closing when turning model into ad-hoc question", async () => {
          const closeSidebarSpy = jest.spyOn(ui, "onCloseQuestionInfo");
          await setup({ question, isShowingTemplateTagsEditor: true });
          expect(closeSidebarSpy).not.toHaveBeenCalled();
        });
      });
    });
  });

  describe("models", () => {
    describe("common", () => {
      MODEL_TEST_CASES.forEach(testCase => {
        const { question, questionType } = testCase;

        describe(questionType, () => {
          it("un-marks new ad-hoc question as model", async () => {
            const { result } = await setup({ question });
            expect(result.card.dataset).toBe(false);
          });

          it("triggers question details sidebar closing when turning model into ad-hoc question", async () => {
            const closeSidebarSpy = jest.spyOn(ui, "onCloseQuestionInfo");
            await setup({ question, isShowingTemplateTagsEditor: true });
            expect(closeSidebarSpy).toHaveBeenCalledTimes(1);
          });
        });
      });
    });

    describe("structured", () => {
      const { question } = TEST_CASE.STRUCTURED_MODEL;

      it("doesn't turn into ad-hoc in 'dataset' QB mode", async () => {
        const { result } = await setup({
          question,
          queryBuilderMode: "dataset",
        });
        expect(result.card).toEqual(question.card());
      });
    });

    describe("native", () => {
      const { question } = TEST_CASE.NATIVE_MODEL;

      it("doesn't turn into ad-hoc in 'dataset' QB mode", async () => {
        const { result } = await setup({
          question,
          queryBuilderMode: "dataset",
        });
        expect(result.card).toEqual({
          ...question.card(),
          parameters: [],
        });
      });
    });
  });

  describe("native", () => {
    NATIVE_TEST_CASES.forEach(testCase => {
      const { question, questionType } = testCase;

      describe(questionType, () => {
        it("forces 'view' query builder mode", async () => {
          const setModeSpy = jest.spyOn(ui, "setQueryBuilderMode");
          await setup({ question, queryBuilderMode: "notebook" });
          expect(setModeSpy).toHaveBeenCalledWith("view", {
            shouldUpdateUrl: false,
          });
        });
      });
    });
  });

  describe("structured", () => {
    const modelTestCases = STRUCTURED_TEST_CASES.filter(testCase => {
      return testCase.question.isDataset();
    });
    const structuredQuestionTestCases = STRUCTURED_TEST_CASES.filter(
      testCase => {
        return !testCase.question.isDataset();
      },
    );

    modelTestCases.forEach(testCase => {
      const { question, questionType } = testCase;

      describe(questionType, () => {
        it("loads metadata for the model", async () => {
          const loadMetadataSpy = jest.spyOn(
            questionActions,
            "loadMetadataForCard",
          );

          await setup({ question });
          expect(loadMetadataSpy).toHaveBeenCalledTimes(1);
        });

        it("refreshes question metadata if there's difference in dependent metadata", async () => {
          const loadMetadataSpy = jest.spyOn(
            questionActions,
            "loadMetadataForCard",
          );
          const join = new Join(PRODUCTS_JOIN_CLAUSE);
          const query = question.query() as StructuredQuery;
          const questionWithJoin = query.join(join).question();

          await setup({
            question: questionWithJoin,
            originalQuestion: question,
          });

          expect(loadMetadataSpy).toHaveBeenCalledWith(
            expect.objectContaining({
              dataset_query: questionWithJoin.datasetQuery(),
            }),
          );
        });
      });
    });

    structuredQuestionTestCases.forEach(testCase => {
      const { question, questionType } = testCase;

      describe(questionType, () => {
        it("doesn't refresh question metadata if dependent metadata doesn't change", async () => {
          const loadMetadataSpy = jest.spyOn(
            questionActions,
            "loadMetadataForCard",
          );

          await setup({ question });
          expect(loadMetadataSpy).not.toHaveBeenCalled();
        });

        it("refreshes question metadata if there's difference in dependent metadata", async () => {
          const loadMetadataSpy = jest.spyOn(
            questionActions,
            "loadMetadataForCard",
          );
          const join = new Join(PRODUCTS_JOIN_CLAUSE);
          const query = question.query() as StructuredQuery;
          const questionWithJoin = query.join(join).question();

          await setup({
            question: questionWithJoin,
            originalQuestion: question,
          });

          expect(loadMetadataSpy).toHaveBeenCalledWith(
            expect.objectContaining({
              dataset_query: questionWithJoin.datasetQuery(),
            }),
          );
        });

        it("converts the question into a model if the query builder is in 'dataset' mode", async () => {
          const { result } = await setup({
            question,
            queryBuilderMode: "dataset",
          });

          expect(result.card.dataset).toBe(true);
        });
      });
    });
  });

  describe("template tags editor visibility", () => {
    const VARIABLE_TAG_1: TemplateTag = {
      id: "id_1",
      name: "tag",
      type: "text",
      "display-name": "Variable Tag 1",
    };

    const VARIABLE_TAG_2: TemplateTag = {
      id: "id_2",
      name: "tag",
      type: "number",
      "display-name": "Variable Tag 2",
    };

    const CARD_TAG: TemplateTag = {
      id: "id_3",
      name: "tag_3",
      type: "card",
      "display-name": "Card Tag 3",
    };

    const SNIPPET_TAG: TemplateTag = {
      id: "id_4",
      "snippet-id": 1,
      "display-name": "foo",
      name: "foo",
      "snippet-name": "foo",
      type: "snippet",
    };

    async function setupTemplateTags({
      question,
      tagsBefore,
      tagsAfter,
      ...opts
    }: SetupOpts & {
      tagsBefore: Record<string, TemplateTag>;
      tagsAfter: Record<string, TemplateTag>;
    }) {
      const setTemplateTagEditorVisibleSpy = jest.spyOn(
        native,
        "setIsShowingTemplateTagsEditor",
      );

      let questionWithTags = question.clone();
      let originalQuestion = getDefaultOriginalQuestion(question);

      Object.keys(tagsBefore).forEach(tagName => {
        const query = originalQuestion.query() as NativeQuery;
        originalQuestion = query
          .setTemplateTag(tagName, tagsBefore[tagName])
          .question();
      });

      Object.keys(tagsAfter).forEach(tagName => {
        const query = questionWithTags.query() as NativeQuery;
        questionWithTags = query
          .setTemplateTag(tagName, tagsAfter[tagName])
          .question();
      });

      const result = await setup({
        ...opts,
        question: questionWithTags,
        originalQuestion,
        queryBuilderMode: question.isDataset() ? "dataset" : "view",
      });

      return {
        ...result,
        setTemplateTagEditorVisibleSpy,
      };
    }

    describe("native models", () => {
      const { question } = TEST_CASE.NATIVE_MODEL;
      it("doesn't open tags editor bar after adding a variable tag", async () => {
        const { setTemplateTagEditorVisibleSpy } = await setupTemplateTags({
          question,
          tagsBefore: {},
          tagsAfter: { foo: VARIABLE_TAG_1 },
          isShowingTemplateTagsEditor: false,
        });

        expect(setTemplateTagEditorVisibleSpy).not.toHaveBeenCalled();
      });
    });

    [...NATIVE_TEST_CASES].forEach(testCase => {
      const { question, questionType } = testCase;

      describe(questionType, () => {
        it("opens tags editor bar after adding first variable tag", async () => {
          const { setTemplateTagEditorVisibleSpy } = await setupTemplateTags({
            question,
            tagsBefore: {},
            tagsAfter: { foo: VARIABLE_TAG_1 },
            isShowingTemplateTagsEditor: false,
          });

          expect(setTemplateTagEditorVisibleSpy).toHaveBeenCalledWith(true);
        });

        it("opens tags editor bar after adding a new template tag", async () => {
          const { setTemplateTagEditorVisibleSpy } = await setupTemplateTags({
            question,
            tagsBefore: { foo: VARIABLE_TAG_1 },
            tagsAfter: { foo: VARIABLE_TAG_1, bar: VARIABLE_TAG_2 },
            isShowingTemplateTagsEditor: false,
          });

          expect(setTemplateTagEditorVisibleSpy).toHaveBeenCalledWith(true);
        });

        it("doesn't open tags editor bar after adding a snippet", async () => {
          const { setTemplateTagEditorVisibleSpy } = await setupTemplateTags({
            question,
            tagsBefore: {},
            tagsAfter: { snippet: SNIPPET_TAG },
            isShowingTemplateTagsEditor: false,
          });

          expect(setTemplateTagEditorVisibleSpy).not.toHaveBeenCalled();
        });

        it("doesn't open tags editor bar after adding a card tag", async () => {
          const { setTemplateTagEditorVisibleSpy } = await setupTemplateTags({
            question,
            tagsBefore: {},
            tagsAfter: { foo: CARD_TAG },
            isShowingTemplateTagsEditor: false,
          });

          expect(setTemplateTagEditorVisibleSpy).not.toHaveBeenCalled();
        });

        it("doesn't open tags editor bar after removing a template tag", async () => {
          const { setTemplateTagEditorVisibleSpy } = await setupTemplateTags({
            question,
            tagsBefore: { foo: VARIABLE_TAG_1, bar: VARIABLE_TAG_2 },
            tagsAfter: { foo: VARIABLE_TAG_1 },
            isShowingTemplateTagsEditor: false,
          });

          expect(setTemplateTagEditorVisibleSpy).not.toHaveBeenCalled();
        });

        it("doesn't open tags editor bar after removing the last template tag", async () => {
          const { setTemplateTagEditorVisibleSpy } = await setupTemplateTags({
            question,
            tagsBefore: { foo: VARIABLE_TAG_1 },
            tagsAfter: {},
            isShowingTemplateTagsEditor: false,
          });

          expect(setTemplateTagEditorVisibleSpy).not.toHaveBeenCalled();
        });

        it("doesn't open tags editor after removing a snippet", async () => {
          const { setTemplateTagEditorVisibleSpy } = await setupTemplateTags({
            question,
            tagsBefore: {},
            tagsAfter: { snippet: SNIPPET_TAG },
            isShowingTemplateTagsEditor: false,
          });

          expect(setTemplateTagEditorVisibleSpy).not.toHaveBeenCalled();
        });

        it("doesn't close tags editor bar after removing a variable tag", async () => {
          const { setTemplateTagEditorVisibleSpy } = await setupTemplateTags({
            question,
            tagsBefore: { foo: VARIABLE_TAG_1, bar: VARIABLE_TAG_2 },
            tagsAfter: { foo: VARIABLE_TAG_1 },
            isShowingTemplateTagsEditor: true,
          });

          expect(setTemplateTagEditorVisibleSpy).not.toHaveBeenCalled();
        });

        it("closes tags editor bar after removing the last variable tag", async () => {
          const { setTemplateTagEditorVisibleSpy } = await setupTemplateTags({
            question,
            tagsBefore: { foo: VARIABLE_TAG_1 },
            tagsAfter: {},
            isShowingTemplateTagsEditor: true,
          });

          expect(setTemplateTagEditorVisibleSpy).toHaveBeenCalledWith(false);
        });
      });
    });
  });

  describe("pivot tables", () => {
    const question = getSavedStructuredQuestion(PIVOT_TABLE_QUESTION);

    it("forces query rerun after recomputing pivot table viz settings", async () => {
      jest.spyOn(Question.prototype, "canAutoRun").mockReturnValue(true);
      const runQuerySpy = jest.spyOn(querying, "runQuestionQuery");
      const pivotTableSettings = question.setting("pivot_table.column_split");

      const { result } = await setup({
        question,
        originalQuestion: getDefaultOriginalQuestion(question),
        run: false,
      });

      expect(runQuerySpy).toHaveBeenCalledTimes(1);
      expect(pivotTableSettings).not.toEqual(
        result.card.visualization_settings["pivot_table.column_split"],
      );
    });

    it("forces query run if switching to pivot table visualization", async () => {
      jest.spyOn(Question.prototype, "canAutoRun").mockReturnValue(true);
      const runQuerySpy = jest.spyOn(querying, "runQuestionQuery");

      await setup({
        question,
        originalQuestion: getSavedStructuredQuestion(),
        run: false,
      });

      expect(runQuerySpy).toHaveBeenCalledTimes(1);
    });

    it("forces query run if switching from pivot table visualization", async () => {
      jest.spyOn(Question.prototype, "canAutoRun").mockReturnValue(true);
      const runQuerySpy = jest.spyOn(querying, "runQuestionQuery");

      await setup({
        question: getSavedStructuredQuestion(),
        originalQuestion: question,
        run: false,
      });

      expect(runQuerySpy).toHaveBeenCalledTimes(1);
    });

    it("forces query run if pivot table visualization settings change", async () => {
      jest.spyOn(Question.prototype, "canAutoRun").mockReturnValue(true);
      const runQuerySpy = jest.spyOn(querying, "runQuestionQuery");

      await setup({
        question: question.setSettings({
          "pivot_table.column_split": {
            columns: [PIVOT_TABLE_ORDER_CREATED_AT_FIELD],
            rows: [
              PIVOT_TABLE_PRODUCT_CATEGORY_FIELD,
              PIVOT_TABLE_PEOPLE_SOURCE_FIELD,
            ],
            values: [["aggregation", 0]],
          },
        }),
        originalQuestion: question,
        run: false,
      });

      expect(runQuerySpy).toHaveBeenCalledTimes(1);
    });
  });
});
