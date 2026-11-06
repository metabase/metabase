import {
  createMockMetadata,
  createMockMetadataFromState,
} from "__support__/metadata";
import {
  createMockQueryBuilderState,
  createMockQueryBuilderUIControlsState,
  createMockState,
} from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import * as questionActions from "metabase/questions/actions";
import type { QueryBuilderMode } from "metabase/redux/store";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_PROVIDER,
  createMetadataProvider,
} from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { Card, TestTemplateTag, UnsavedCard } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockSavedQuestionsDatabase,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  REVIEWS_ID,
  createOrdersTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { UPDATE_QUESTION } from "../../store/actions";
import * as qbActions from "../../store/actions";
import * as querying from "../querying";
import * as ui from "../ui";
import * as url from "../url";

import * as native from "./native";
import { updateQuestion } from "./updateQuestion";

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

function createNativeJsQuery(
  templateTags: Record<string, TestTemplateTag> = {},
  query = "select * from orders",
) {
  const tagsSql = Object.values(templateTags)
    .map((tag) => `{{${tag.name}}}`)
    .join(" ");
  return Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, {
    query: `${query} ${tagsSql}`,
    templateTags,
  });
}

function createAdHocCard(opts?: Partial<UnsavedCard>): UnsavedCard {
  return createMockUnsavedCard({
    dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
    ...opts,
  });
}

function createAdHocNativeCard(opts?: Partial<UnsavedCard>): UnsavedCard {
  return createMockUnsavedCard({
    dataset_query: createNativeJsQuery(),
    ...opts,
  });
}

function createSavedStructuredCard(opts?: Partial<Card>): Card {
  return createMockCard({
    dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
    ...opts,
  });
}

function createSavedNativeCard(opts?: Partial<Card>): Card {
  return createMockCard({
    query_type: "native",
    dataset_query: createNativeJsQuery(),
    ...opts,
  });
}

function createStructuredModelCard(opts?: Partial<Card>): Card {
  return createSavedStructuredCard({ type: "model", ...opts });
}

function createNativeModelCard(opts?: Partial<Card>): Card {
  return createSavedNativeCard({ type: "model", ...opts });
}

function getDefaultOriginalQuestion(card: TestCard) {
  const query = Lib.fromJsQuery(SAMPLE_PROVIDER, card.dataset_query);
  if (Lib.queryDisplayInfo(query).isNative) {
    return createSavedNativeCard({
      ...card,
      dataset_query: Lib.toJsQuery(
        Lib.withNativeQuery(query, "select * from products limit 5"),
      ),
    });
  }
  return createMockCard({
    ...card,
    dataset_query: Lib.toJsQuery(
      Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            filters: [
              {
                type: "operator",
                operator: "=",
                args: [
                  { type: "column", name: "TAX" },
                  { type: "literal", value: 5 },
                ],
              },
            ],
          },
        ],
      }),
    ),
  });
}

function createComposedModelCard({ id = 1, ...opts }: Partial<Card> = {}) {
  const sourceCard = createStructuredModelCard({ id });
  const provider = createMetadataProvider({
    metadata: createMockMetadata({
      databases: [createSampleDatabase()],
      questions: [sourceCard],
    }),
  });
  return createMockCard({
    type: "model",
    display: "table",
    visualization_settings: {},
    dataset_query: Lib.toJsQuery(
      Lib.createTestQuery(provider, {
        stages: [{ source: { type: "card", id } }],
      }),
    ),
    ...opts,
    id,
  });
}

function addReviewsJoin<T extends TestCard>(card: T): T {
  const metadata = createMockMetadata({
    databases: [createSampleDatabase()],
    questions: "id" in card ? [createStructuredModelCard({ id: card.id })] : [],
  });
  const query = new Question(card, metadata).query();
  const sourceCardId = Lib.primarySourceCardId(query);
  const provider = createMetadataProvider({ metadata });
  return {
    ...card,
    dataset_query: Lib.toJsQuery(
      Lib.createTestQuery(provider, {
        stages: [
          {
            source:
              sourceCardId != null
                ? { type: "card", id: sourceCardId }
                : { type: "table", id: ORDERS_ID },
            joins: [
              {
                source: { type: "table", id: REVIEWS_ID },
                strategy: "left-join",
                alias: "Products",
                conditions: [
                  {
                    operator: "=",
                    left: { type: "column", name: "ID" },
                    right: { type: "column", name: "ID" },
                  },
                ],
              },
            ],
          },
        ],
      }),
    ),
  };
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
  const dispatch = jest.fn().mockReturnValue({ mock: "mock" });

  const cards = originalCard ? [originalCard] : [];
  if (isSavedCard) {
    cards.push(card);
  }

  const entitiesState = createMockEntitiesState({
    databases: [createSampleDatabase(), SAVED_QUESTIONS_DB],
    // Unjustified type cast. FIXME
    questions: cards,
  });

  const metadata = createMockMetadataFromState(
    createMockState({ entities: entitiesState }),
  );
  const ordersTable = createOrdersTable();
  const ordersFields = ordersTable.fields ?? [];
  const question = isSavedCard
    ? checkNotNull(metadata.question(card.id))
    : new Question(card, metadata);

  const queryResult = createMockDataset({
    data: {
      cols: ordersFields.map((field) =>
        createMockColumn({
          ...field,
          id: Number(field.id),
          source: "fields",
          field_ref: ["field", Number(field.id), null],
        }),
      ),
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
    (call) => call[0]?.type === UPDATE_QUESTION,
  );
  const hasDispatchedInitAction = Array.isArray(actions);
  const result = hasDispatchedInitAction ? actions[0].payload : null;

  return { question, dispatch, result };
}

const PIVOT_TABLE_QUESTION: UnsavedCard = {
  display: "pivot",
  dataset_query: Lib.toJsQuery(
    Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "operator", operator: "count", args: [] }],
          breakouts: [
            { type: "column", name: "CREATED_AT", unit: "year" },
            {
              type: "column",
              name: "SOURCE",
              sourceFieldId: ORDERS.USER_ID,
            },
            {
              type: "column",
              name: "CATEGORY",
              sourceFieldId: ORDERS.PRODUCT_ID,
            },
          ],
        },
      ],
    }),
  ),
  visualization_settings: {
    "pivot_table.column_split": {
      columns: ["CATEGORY"],
      rows: ["SOURCE", "CREATED_AT"],
      values: ["count"],
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
    ALL_TEST_CASES.forEach((testCase) => {
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
          const updateUrlSpy = jest.spyOn(url, "updateUrl");
          await setup({ card: getCard(), shouldUpdateUrl: true });
          expect(updateUrlSpy).toHaveBeenCalledTimes(1);
        });

        it("doesn't update URL if `shouldUpdateUrl: false` option provided", async () => {
          const updateUrlSpy = jest.spyOn(url, "updateUrl");
          await setup({ card: getCard(), shouldUpdateUrl: false });
          expect(updateUrlSpy).not.toHaveBeenCalled();
        });
      });
    });
  });

  describe("saved questions and models", () => {
    describe("common", () => {
      [...SAVED_QUESTION_TEST_CASES, ...MODEL_TEST_CASES].forEach(
        (testCase) => {
          const { getCard, questionType } = testCase;

          describe(questionType, () => {
            it("turns question into ad-hoc", async () => {
              const { question, result } = await setup({ card: getCard() });
              expect(result.card.id).toBeUndefined();
              expect(result.card.name).toBeUndefined();
              expect(result.card.description).toBeUndefined();
              expect(result.card.dataset_query).toEqual(
                question.datasetQuery(),
              );
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
              expect(result.card.dataset_query).toEqual(
                question.datasetQuery(),
              );
              expect(result.card.visualization_settings).toEqual(
                question.settings(),
              );
            });
          });
        },
      );
    });

    describe("native questions and models", () => {
      [TEST_CASE.SAVED_NATIVE_QUESTION, TEST_CASE.NATIVE_MODEL].forEach(
        (testCase) => {
          const { getCard, questionType } = testCase;

          describe(questionType, () => {
            it("doesn't turn read-only questions into ad-hoc", async () => {
              const card = getCard({
                dataset_query: {
                  ...createNativeJsQuery(),
                  database: null,
                },
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
    SAVED_QUESTION_TEST_CASES.forEach((testCase) => {
      const { getCard, questionType } = testCase;

      describe(questionType, () => {
        it("triggers question details sidebar closing when turning model into ad-hoc question", async () => {
          const closeSidebarSpy = jest.spyOn(qbActions, "onCloseQuestionInfo");
          await setup({ card: getCard(), isShowingTemplateTagsEditor: true });
          expect(closeSidebarSpy).not.toHaveBeenCalled();
        });
      });
    });
  });

  describe("models", () => {
    describe("common", () => {
      MODEL_TEST_CASES.forEach((testCase) => {
        const { getCard, questionType } = testCase;

        describe(questionType, () => {
          it("un-marks new ad-hoc question as model", async () => {
            const card = getCard();
            const { result } = await setup({ card });
            expect(card.type).toBe("model");
            expect(result.card.type).toBe("question");
          });

          it("triggers question details sidebar closing when turning model into ad-hoc question", async () => {
            const closeSidebarSpy = jest.spyOn(
              qbActions,
              "onCloseQuestionInfo",
            );
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
    NATIVE_TEST_CASES.forEach((testCase) => {
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
    STRUCTURED_MODEL_TEST_CASES.forEach((testCase) => {
      const { getCard, questionType } = testCase;

      describe(questionType, () => {
        it("refreshes question metadata if there's difference in dependent metadata", async () => {
          const loadMetadataSpy = jest.spyOn(
            questionActions,
            "loadMetadataForCard",
          );

          const originalCard = getCard();
          const cardWithJoin = addReviewsJoin(originalCard);

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

    STRUCTURED_QUESTIONS_TEST_CASES.forEach((testCase) => {
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
          const cardWithJoin = addReviewsJoin(originalCard);

          await setup({
            card: cardWithJoin,
            // Unjustified type cast. FIXME
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
    const VARIABLE_TAG_1: TestTemplateTag = {
      id: "id_1",
      name: "foo",
      type: "text",
      "display-name": "Variable Tag 1",
    };

    const VARIABLE_TAG_2: TestTemplateTag = {
      id: "id_2",
      name: "bar",
      type: "number",
      "display-name": "Variable Tag 2",
    };

    const CARD_TAG: TestTemplateTag = {
      id: "id_3",
      name: "#1-card",
      "card-id": 1,
      type: "card",
      "display-name": "Card Tag 3",
    };

    const SNIPPET_TAG: TestTemplateTag = {
      id: "id_4",
      "snippet-id": 1,
      "display-name": "foo",
      name: "snippet: foo",
      "snippet-name": "foo",
      type: "snippet",
    };

    async function setupTemplateTags({
      card,
      tagsBefore,
      tagsAfter,
      ...opts
    }: Omit<SetupOpts, "card"> & {
      card: TestCard;
      tagsBefore: Record<string, TestTemplateTag>;
      tagsAfter: Record<string, TestTemplateTag>;
    }) {
      const setTemplateTagEditorVisibleSpy = jest.spyOn(
        native,
        "setIsShowingTemplateTagsEditor",
      );

      const originalCard = createSavedNativeCard({
        ...card,
        dataset_query: createNativeJsQuery(
          tagsBefore,
          "select * from products limit 5",
        ),
      });

      const cardWithTags = {
        ...card,
        dataset_query: createNativeJsQuery(tagsAfter),
      };

      const result = await setup({
        ...opts,
        card: cardWithTags,
        originalCard,
        // Unjustified type cast. FIXME
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

    [...NATIVE_TEST_CASES].forEach((testCase) => {
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
            tagsAfter: { "snippet: foo": SNIPPET_TAG },
            isShowingTemplateTagsEditor: false,
          });

          expect(setTemplateTagEditorVisibleSpy).not.toHaveBeenCalled();
        });

        it("doesn't open tags editor bar after adding a card tag", async () => {
          const { setTemplateTagEditorVisibleSpy } = await setupTemplateTags({
            card: getCard(),
            tagsBefore: {},
            tagsAfter: { "#1-card": CARD_TAG },
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
            tagsAfter: { "snippet: foo": SNIPPET_TAG },
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
    const card = createMockCard(PIVOT_TABLE_QUESTION);

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
              columns: ["CREATED_AT"],
              rows: ["CATEGORY", "SOURCE"],
              values: ["count"],
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
