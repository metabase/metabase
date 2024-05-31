import { createMockEntitiesState } from "__support__/store";
import { checkNotNull } from "metabase/lib/types";
import * as questionActions from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import registerVisualizations from "metabase/visualizations/register";
import Question from "metabase-lib/v1/Question";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type {
  Card,
  ConcreteFieldReference,
  Join,
  NativeDatasetQuery,
  StructuredDatasetQuery,
  TemplateTag,
  UnsavedCard,
} from "metabase-types/api";
import {
  createMockDataset,
  createMockNativeDatasetQuery,
  createMockNativeQuery,
  createMockSavedQuestionsDatabase,
  createMockStructuredDatasetQuery,
  createMockStructuredQuery,
  createMockTable,
} from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  createAdHocCard,
  createSavedStructuredCard,
  createAdHocNativeCard,
  createSavedNativeCard,
  createStructuredModelCard,
  createNativeModelCard,
  createComposedModelCard,
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PEOPLE,
  SAMPLE_DB_ID,
  REVIEWS,
  REVIEWS_ID,
} from "metabase-types/api/mocks/presets";
import type { QueryBuilderMode } from "metabase-types/store";
import {
  createMockState,
  createMockQueryBuilderState,
  createMockQueryBuilderUIControlsState,
} from "metabase-types/store/mocks";

import * as native from "../native";
import * as navigation from "../navigation";
import * as querying from "../querying";
import * as ui from "../ui";

import { updateQuestion, UPDATE_QUESTION } from "./updateQuestion";

registerVisualizations();

type TestCard = Card | UnsavedCard;

type SetupOpts = {
  card: TestCard;
  originalCard?: Card;
  run?: boolean;
  shouldUpdateUrl?: boolean;
  shouldStartAdHocQuestion?: boolean;
  queryBuilderMode?: QueryBuilderMode;
  isShowingTemplateTagsEditor?: boolean;
};

const SAVED_QUESTIONS_DB = createMockSavedQuestionsDatabase();

function getDefaultOriginalQuestion(card: TestCard) {
  if (card.dataset_query.type === "native") {
    return createSavedNativeCard({
      ...card,
      dataset_query: createMockNativeDatasetQuery({
        ...card.dataset_query,
        database: SAMPLE_DB_ID,
        native: createMockNativeQuery({
          ...card.dataset_query.native,
          query: "select * from products limit 5",
        }),
      }),
    });
  }
  return createSavedStructuredCard({
    ...card,
    dataset_query: createMockStructuredDatasetQuery({
      database: SAMPLE_DB_ID,
      query: createMockStructuredQuery({
        "source-table": ORDERS_ID,
        filter: ["=", ["field", ORDERS.TAX, null], 5],
      }),
    }),
  });
}

function getModelVirtualTable(card: Card) {
  return createMockTable({
    id: getQuestionVirtualTableId(card.id),
    db_id: SAVED_QUESTIONS_DB.id,
    name: card.name,
    display_name: card.name,
    fields: card.result_metadata,
  });
}

async function setup({
  card,
  originalCard = getDefaultOriginalQuestion(card),
  queryBuilderMode = "view",
  isShowingTemplateTagsEditor = false,
  run,
  shouldUpdateUrl,
  shouldStartAdHocQuestion,
}: SetupOpts) {
  const isSavedCard = "id" in card;
  const isModel = (card as Card).type === "model";

  const dispatch = jest.fn().mockReturnValue({ mock: "mock" });

  const cards = originalCard ? [originalCard] : [];
  if (isSavedCard) {
    cards.push(card);
  }

  const entitiesState = createMockEntitiesState({
    databases: [createSampleDatabase(), SAVED_QUESTIONS_DB],
    tables: isModel ? [getModelVirtualTable(card as Card)] : [],
    questions: cards,
  });

  const metadata = getMetadata(createMockState({ entities: entitiesState }));
  const ordersTable = checkNotNull(metadata.table(ORDERS_ID));
  const question = isSavedCard
    ? checkNotNull(metadata.question(card.id))
    : new Question(card, metadata);

  const queryResult = createMockDataset({
    data: {
      cols: ordersTable.getFields().map(field => field.column()),
    },
  });

  const qbState = createMockQueryBuilderState({
    card: originalCard,
    queryResults: [queryResult],
    uiControls: createMockQueryBuilderUIControlsState({
      queryBuilderMode,
      isShowingTemplateTagsEditor,
    }),
  });

  const getState = () => ({
    ...createMockState(),
    entities: entitiesState,
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

  return { question, dispatch, result };
}

const REVIEW_JOIN_CLAUSE: Join = {
  alias: "Products",
  condition: [
    "=",
    ["field", ORDERS.ID, null],
    ["field", REVIEWS.ID, { "join-alias": "Reviews" }],
  ],
  "source-table": REVIEWS_ID,
};

const PIVOT_TABLE_ORDER_CREATED_AT_FIELD: ConcreteFieldReference = [
  "field",
  ORDERS.CREATED_AT,
  { "temporal-unit": "year" },
];

const PIVOT_TABLE_PEOPLE_SOURCE_FIELD: ConcreteFieldReference = [
  "field",
  PEOPLE.SOURCE,
  { "source-field": ORDERS.USER_ID },
];

const PIVOT_TABLE_PRODUCT_CATEGORY_FIELD: ConcreteFieldReference = [
  "field",
  PRODUCTS.CATEGORY,
  { "source-field": ORDERS.PRODUCT_ID },
];

const PIVOT_TABLE_QUESTION: UnsavedCard<StructuredDatasetQuery> = {
  display: "pivot",
  dataset_query: {
    type: "query",
    database: SAMPLE_DB_ID,
    query: {
      "source-table": ORDERS_ID,
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
      getCard: createSavedStructuredCard,
      questionType: "saved structured question",
    },
    UNSAVED_STRUCTURED_QUESTION: {
      getCard: createAdHocCard,
      questionType: "ad-hoc structured question",
    },

    SAVED_NATIVE_QUESTION: {
      getCard: createSavedNativeCard,
      questionType: "saved native question",
    },
    UNSAVED_NATIVE_QUESTION: {
      getCard: createAdHocNativeCard,
      questionType: "unsaved native question",
    },

    STRUCTURED_MODEL: {
      getCard: createStructuredModelCard,
      questionType: "structured model",
    },
    NATIVE_MODEL: {
      getCard: createNativeModelCard,
      questionType: "native model",
    },
    COMPOSED_MODEL: {
      getCard: createComposedModelCard,
      questionType: "composed model",
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

  const STRUCTURED_MODEL_TEST_CASES = [
    TEST_CASE.STRUCTURED_MODEL,
    TEST_CASE.COMPOSED_MODEL,
  ];

  const STRUCTURED_QUESTIONS_TEST_CASES = [
    TEST_CASE.SAVED_STRUCTURED_QUESTION,
    TEST_CASE.UNSAVED_STRUCTURED_QUESTION,
  ];

  const NATIVE_TEST_CASES = [
    TEST_CASE.SAVED_NATIVE_QUESTION,
    TEST_CASE.UNSAVED_NATIVE_QUESTION,
  ];

  describe("common", () => {
    ALL_TEST_CASES.forEach(testCase => {
      const { getCard, questionType } = testCase;

      describe(questionType, () => {
        it("runs query if `run: true` option provided", async () => {
          jest.spyOn(Question.prototype, "canAutoRun").mockReturnValue(true);
          const runQuerySpy = jest.spyOn(querying, "runQuestionQuery");

          await setup({ card: getCard(), run: true });

          expect(runQuerySpy).toHaveBeenCalledTimes(1);
        });

        it("doesn't run query if `run: false` option provided", async () => {
          jest.spyOn(Question.prototype, "canAutoRun").mockReturnValue(true);
          const runQuerySpy = jest.spyOn(querying, "runQuestionQuery");

          await setup({ card: getCard(), run: false });

          expect(runQuerySpy).not.toHaveBeenCalled();
        });

        it("doesn't run query if question can't be run automatically", async () => {
          jest.spyOn(Question.prototype, "canAutoRun").mockReturnValue(false);
          const runQuerySpy = jest.spyOn(querying, "runQuestionQuery");

          await setup({ card: getCard(), run: true });

          expect(runQuerySpy).not.toHaveBeenCalled();
        });

        it("updates URL if `shouldUpdateUrl: true` option provided", async () => {
          const updateUrlSpy = jest.spyOn(navigation, "updateUrl");
          await setup({ card: getCard(), shouldUpdateUrl: true });
          expect(updateUrlSpy).toHaveBeenCalledTimes(1);
        });

        it("doesn't update URL if `shouldUpdateUrl: false` option provided", async () => {
          const updateUrlSpy = jest.spyOn(navigation, "updateUrl");
          await setup({ card: getCard(), shouldUpdateUrl: false });
          expect(updateUrlSpy).not.toHaveBeenCalled();
        });
      });
    });
  });

  describe("saved questions and models", () => {
    describe("common", () => {
      [...SAVED_QUESTION_TEST_CASES, ...MODEL_TEST_CASES].forEach(testCase => {
        const { getCard, questionType } = testCase;

        describe(questionType, () => {
          it("turns question into ad-hoc", async () => {
            const { question, result } = await setup({ card: getCard() });
            expect(result.card.id).toBeUndefined();
            expect(result.card.name).toBeUndefined();
            expect(result.card.description).toBeUndefined();
            expect(result.card.dataset_query).toEqual(question.datasetQuery());
            expect(result.card.visualization_settings).toEqual(
              question.settings(),
            );
          });

          it("doesn't turn question into ad-hoc if `shouldStartAdHocQuestion` option is disabled", async () => {
            const { question, result } = await setup({
              card: getCard(),
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
          const { getCard, questionType } = testCase;

          describe(questionType, () => {
            it("doesn't turn read-only questions into ad-hoc", async () => {
              const card = getCard({
                dataset_query: createMockStructuredDatasetQuery({
                  database: null,
                }),
              });

              const { result } = await setup({ card });

              expect(result.card).toEqual(card);
            });
          });
        },
      );
    });

    describe("native questions and models", () => {
      [TEST_CASE.SAVED_NATIVE_QUESTION, TEST_CASE.NATIVE_MODEL].forEach(
        testCase => {
          const { getCard, questionType } = testCase;

          describe(questionType, () => {
            it("doesn't turn read-only questions into ad-hoc", async () => {
              const card = getCard({
                dataset_query: createMockNativeDatasetQuery({
                  database: null,
                }),
              });

              const { result } = await setup({ card });

              expect(result.card).toEqual({
                ...card,
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
      const { getCard, questionType } = testCase;

      describe(questionType, () => {
        it("triggers question details sidebar closing when turning model into ad-hoc question", async () => {
          const closeSidebarSpy = jest.spyOn(ui, "onCloseQuestionInfo");
          await setup({ card: getCard(), isShowingTemplateTagsEditor: true });
          expect(closeSidebarSpy).not.toHaveBeenCalled();
        });
      });
    });
  });

  describe("models", () => {
    describe("common", () => {
      MODEL_TEST_CASES.forEach(testCase => {
        const { getCard, questionType } = testCase;

        describe(questionType, () => {
          it("un-marks new ad-hoc question as model", async () => {
            const card = getCard();
            const { result } = await setup({ card });
            expect(card.type).toBe("model");
            expect(result.card.type).toBe("question");
          });

          it("triggers question details sidebar closing when turning model into ad-hoc question", async () => {
            const closeSidebarSpy = jest.spyOn(ui, "onCloseQuestionInfo");
            await setup({ card: getCard(), isShowingTemplateTagsEditor: true });
            expect(closeSidebarSpy).toHaveBeenCalledTimes(1);
          });
        });
      });
    });

    describe("structured", () => {
      const { getCard } = TEST_CASE.STRUCTURED_MODEL;

      it("doesn't turn into ad-hoc in 'dataset' QB mode", async () => {
        const card = getCard();
        const { result } = await setup({ card, queryBuilderMode: "dataset" });
        expect(result.card).toEqual(card);
      });
    });

    describe("native", () => {
      const { getCard } = TEST_CASE.NATIVE_MODEL;

      it("doesn't turn into ad-hoc in 'dataset' QB mode", async () => {
        const card = getCard();
        const { result } = await setup({ card, queryBuilderMode: "dataset" });
        expect(result.card).toEqual({ ...card, parameters: [] });
      });
    });
  });

  describe("native", () => {
    NATIVE_TEST_CASES.forEach(testCase => {
      const { getCard, questionType } = testCase;

      describe(questionType, () => {
        it("forces 'view' query builder mode", async () => {
          const setModeSpy = jest.spyOn(ui, "setQueryBuilderMode");
          await setup({ card: getCard(), queryBuilderMode: "notebook" });
          expect(setModeSpy).toHaveBeenCalledWith("view", {
            shouldUpdateUrl: false,
          });
        });
      });
    });
  });

  describe("structured", () => {
    STRUCTURED_MODEL_TEST_CASES.forEach(testCase => {
      const { getCard, questionType } = testCase;

      describe(questionType, () => {
        it("refreshes question metadata if there's difference in dependent metadata", async () => {
          const loadMetadataSpy = jest.spyOn(
            questionActions,
            "loadMetadataForCard",
          );

          const originalCard = getCard();
          const originalQuery =
            originalCard.dataset_query as StructuredDatasetQuery;

          const cardWithJoin = {
            ...originalCard,
            dataset_query: createMockStructuredDatasetQuery({
              ...originalQuery,
              query: createMockStructuredQuery({
                ...originalQuery.query,
                joins: [REVIEW_JOIN_CLAUSE],
              }),
            }),
          };

          await setup({
            card: cardWithJoin,
            originalCard,
          });

          expect(loadMetadataSpy).toHaveBeenCalledWith(
            expect.objectContaining({
              dataset_query: cardWithJoin.dataset_query,
            }),
          );
        });
      });
    });

    STRUCTURED_QUESTIONS_TEST_CASES.forEach(testCase => {
      const { getCard, questionType } = testCase;

      describe(questionType, () => {
        it("doesn't refresh question metadata if dependent metadata doesn't change", async () => {
          const loadMetadataSpy = jest.spyOn(
            questionActions,
            "loadMetadataForCard",
          );

          await setup({ card: getCard() });
          expect(loadMetadataSpy).not.toHaveBeenCalled();
        });

        it("refreshes question metadata if there's difference in dependent metadata", async () => {
          const loadMetadataSpy = jest.spyOn(
            questionActions,
            "loadMetadataForCard",
          );
          const originalCard = getCard();
          const originalQuery =
            originalCard.dataset_query as StructuredDatasetQuery;

          const cardWithJoin = {
            ...originalCard,
            dataset_query: createMockStructuredDatasetQuery({
              ...originalQuery,
              query: createMockStructuredQuery({
                ...originalQuery.query,
                joins: [REVIEW_JOIN_CLAUSE],
              }),
            }),
          };

          await setup({
            card: cardWithJoin,
            originalCard: originalCard as Card,
          });

          expect(loadMetadataSpy).toHaveBeenCalledWith(
            expect.objectContaining({
              dataset_query: cardWithJoin.dataset_query,
            }),
          );
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
      card,
      tagsBefore,
      tagsAfter,
      ...opts
    }: Omit<SetupOpts, "card"> & {
      card: Card<NativeDatasetQuery> | UnsavedCard<NativeDatasetQuery>;
      tagsBefore: Record<string, TemplateTag>;
      tagsAfter: Record<string, TemplateTag>;
    }) {
      const setTemplateTagEditorVisibleSpy = jest.spyOn(
        native,
        "setIsShowingTemplateTagsEditor",
      );

      const originalCard = getDefaultOriginalQuestion({
        ...card,
        dataset_query: {
          ...card.dataset_query,
          native: {
            ...card.dataset_query.native,
            "template-tags": tagsBefore,
          },
        },
      });

      const cardWithTags = {
        ...card,
        dataset_query: {
          ...card.dataset_query,
          native: {
            ...card.dataset_query.native,
            "template-tags": tagsAfter,
          },
        },
      };

      const result = await setup({
        ...opts,
        card: cardWithTags,
        originalCard,
        queryBuilderMode: (card as Card).type === "model" ? "dataset" : "view",
      });

      return {
        ...result,
        setTemplateTagEditorVisibleSpy,
      };
    }

    describe("native models", () => {
      const { getCard } = TEST_CASE.NATIVE_MODEL;
      it("doesn't open tags editor bar after adding a variable tag", async () => {
        const { setTemplateTagEditorVisibleSpy } = await setupTemplateTags({
          card: getCard(),
          tagsBefore: {},
          tagsAfter: { foo: VARIABLE_TAG_1 },
          isShowingTemplateTagsEditor: false,
        });

        expect(setTemplateTagEditorVisibleSpy).not.toHaveBeenCalled();
      });
    });

    [...NATIVE_TEST_CASES].forEach(testCase => {
      const { getCard, questionType } = testCase;

      describe(questionType, () => {
        it("opens tags editor bar after adding first variable tag", async () => {
          const { setTemplateTagEditorVisibleSpy } = await setupTemplateTags({
            card: getCard(),
            tagsBefore: {},
            tagsAfter: { foo: VARIABLE_TAG_1 },
            isShowingTemplateTagsEditor: false,
          });

          expect(setTemplateTagEditorVisibleSpy).toHaveBeenCalledWith(true);
        });

        it("opens tags editor bar after adding a new template tag", async () => {
          const { setTemplateTagEditorVisibleSpy } = await setupTemplateTags({
            card: getCard(),
            tagsBefore: { foo: VARIABLE_TAG_1 },
            tagsAfter: { foo: VARIABLE_TAG_1, bar: VARIABLE_TAG_2 },
            isShowingTemplateTagsEditor: false,
          });

          expect(setTemplateTagEditorVisibleSpy).toHaveBeenCalledWith(true);
        });

        it("doesn't open tags editor bar after adding a snippet", async () => {
          const { setTemplateTagEditorVisibleSpy } = await setupTemplateTags({
            card: getCard(),
            tagsBefore: {},
            tagsAfter: { snippet: SNIPPET_TAG },
            isShowingTemplateTagsEditor: false,
          });

          expect(setTemplateTagEditorVisibleSpy).not.toHaveBeenCalled();
        });

        it("doesn't open tags editor bar after adding a card tag", async () => {
          const { setTemplateTagEditorVisibleSpy } = await setupTemplateTags({
            card: getCard(),
            tagsBefore: {},
            tagsAfter: { foo: CARD_TAG },
            isShowingTemplateTagsEditor: false,
          });

          expect(setTemplateTagEditorVisibleSpy).not.toHaveBeenCalled();
        });

        it("doesn't open tags editor bar after removing a template tag", async () => {
          const { setTemplateTagEditorVisibleSpy } = await setupTemplateTags({
            card: getCard(),
            tagsBefore: { foo: VARIABLE_TAG_1, bar: VARIABLE_TAG_2 },
            tagsAfter: { foo: VARIABLE_TAG_1 },
            isShowingTemplateTagsEditor: false,
          });

          expect(setTemplateTagEditorVisibleSpy).not.toHaveBeenCalled();
        });

        it("doesn't open tags editor bar after removing the last template tag", async () => {
          const { setTemplateTagEditorVisibleSpy } = await setupTemplateTags({
            card: getCard(),
            tagsBefore: { foo: VARIABLE_TAG_1 },
            tagsAfter: {},
            isShowingTemplateTagsEditor: false,
          });

          expect(setTemplateTagEditorVisibleSpy).not.toHaveBeenCalled();
        });

        it("doesn't open tags editor after removing a snippet", async () => {
          const { setTemplateTagEditorVisibleSpy } = await setupTemplateTags({
            card: getCard(),
            tagsBefore: {},
            tagsAfter: { snippet: SNIPPET_TAG },
            isShowingTemplateTagsEditor: false,
          });

          expect(setTemplateTagEditorVisibleSpy).not.toHaveBeenCalled();
        });

        it("doesn't close tags editor bar after removing a variable tag", async () => {
          const { setTemplateTagEditorVisibleSpy } = await setupTemplateTags({
            card: getCard(),
            tagsBefore: { foo: VARIABLE_TAG_1, bar: VARIABLE_TAG_2 },
            tagsAfter: { foo: VARIABLE_TAG_1 },
            isShowingTemplateTagsEditor: true,
          });

          expect(setTemplateTagEditorVisibleSpy).not.toHaveBeenCalled();
        });

        it("closes tags editor bar after removing the last variable tag", async () => {
          const { setTemplateTagEditorVisibleSpy } = await setupTemplateTags({
            card: getCard(),
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
    const card = createSavedStructuredCard(PIVOT_TABLE_QUESTION);

    it("forces query rerun after recomputing pivot table viz settings", async () => {
      jest.spyOn(Question.prototype, "canAutoRun").mockReturnValue(true);
      const runQuerySpy = jest.spyOn(querying, "runQuestionQuery");
      const pivotTableSettings =
        card.visualization_settings["pivot_table.column_split"];

      const { result } = await setup({
        card: card,
        originalCard: getDefaultOriginalQuestion(card),
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
        card: card,
        originalCard: createSavedStructuredCard(),
        run: false,
      });

      expect(runQuerySpy).toHaveBeenCalledTimes(1);
    });

    it("forces query run if switching from pivot table visualization", async () => {
      jest.spyOn(Question.prototype, "canAutoRun").mockReturnValue(true);
      const runQuerySpy = jest.spyOn(querying, "runQuestionQuery");

      await setup({
        card: createSavedStructuredCard(),
        originalCard: card,
        run: false,
      });

      expect(runQuerySpy).toHaveBeenCalledTimes(1);
    });

    it("forces query run if pivot table visualization settings change", async () => {
      jest.spyOn(Question.prototype, "canAutoRun").mockReturnValue(true);
      const runQuerySpy = jest.spyOn(querying, "runQuestionQuery");

      await setup({
        card: {
          ...card,
          visualization_settings: {
            ...card.visualization_settings,
            "pivot_table.column_split": {
              columns: [PIVOT_TABLE_ORDER_CREATED_AT_FIELD],
              rows: [
                PIVOT_TABLE_PRODUCT_CATEGORY_FIELD,
                PIVOT_TABLE_PEOPLE_SOURCE_FIELD,
              ],
              values: [["aggregation", 0]],
            },
          },
        },
        originalCard: card,
        run: false,
      });

      expect(runQuerySpy).toHaveBeenCalledTimes(1);
    });
  });
});
