import fetchMock from "fetch-mock";
import type { LocationDescriptorObject } from "history";

import * as CardLib from "metabase/lib/card";
import * as Urls from "metabase/lib/urls";

import * as alert from "metabase/alert/alert";
import * as questionActions from "metabase/questions/actions";
import Databases from "metabase/entities/databases";
import Snippets from "metabase/entities/snippets";
import { setErrorPage } from "metabase/redux/app";
import { getMetadata } from "metabase/selectors/metadata";

import type {
  Card,
  DatabaseId,
  NativeDatasetQuery,
  TableId,
  TemplateTag,
  UnsavedCard,
  User,
} from "metabase-types/api";
import { createMockUser } from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  createAdHocCard,
  createSavedStructuredCard,
  createAdHocNativeCard,
  createSavedNativeCard,
  createStructuredModelCard,
  createNativeModelCard,
  ORDERS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

import { createMockEntitiesState } from "__support__/store";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import NativeQuery from "metabase-lib/queries/NativeQuery";
import Question from "metabase-lib/Question";

import * as querying from "../querying";

import * as core from "./core";
import { initializeQB } from "./initializeQB";

type DisplayLock = { displayIsLocked?: boolean };
type TestCard = (Card & DisplayLock) | (UnsavedCard & DisplayLock);

type BaseSetupOpts = {
  user?: User;
  location: LocationDescriptorObject;
  params: Record<string, unknown>;
};

async function baseSetup({ user, location, params }: BaseSetupOpts) {
  jest.useFakeTimers();

  const dispatch = jest.fn().mockReturnValue({ mock: "mock" });

  const state = createMockState({
    entities: createMockEntitiesState({
      databases: [createSampleDatabase()],
    }),
  });

  if (user) {
    state.currentUser = user;
  }

  const metadata = getMetadata(state);
  const getState = () => state;

  await initializeQB(location, params)(dispatch, getState);
  jest.runAllTimers();

  const actions = dispatch.mock.calls.find(
    call => call[0]?.type === "metabase/qb/INITIALIZE_QB",
  );
  const hasDispatchedInitAction = Array.isArray(actions);
  const result = hasDispatchedInitAction ? actions[0].payload : null;

  return { dispatch, state, result, metadata };
}

function getLocationForCard(
  card: TestCard,
  extra: LocationDescriptorObject = {},
): LocationDescriptorObject {
  const isSaved = "id" in card;
  return {
    pathname: isSaved ? Urls.question(card) : Urls.serializedQuestion(card),
    hash: !isSaved ? CardLib.serializeCardForUrl(card) : "",
    query: {},
    ...extra,
  };
}

function getQueryParamsForCard(
  card: TestCard,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const isSaved = "id" in card;
  if (!isSaved) {
    return extra;
  }
  const nameSlug = card.name.toLowerCase().replaceAll(/ /g, "-");
  return {
    slug: `${card.id}-${nameSlug}`,
    ...extra,
  };
}

type SetupOpts = Omit<BaseSetupOpts, "location" | "params"> & {
  card: TestCard;
  location?: LocationDescriptorObject;
  params?: Record<string, unknown>;
};

async function setup({
  card,
  location = getLocationForCard(card),
  params = getQueryParamsForCard(card),
  ...opts
}: SetupOpts) {
  if ("id" in card) {
    fetchMock.get(`path:/api/card/${card.id}`, card);
  }

  jest.spyOn(CardLib, "loadCard").mockReturnValue(Promise.resolve({ ...card }));

  return baseSetup({ location, params, ...opts });
}

const SNIPPET: TemplateTag = {
  id: "id",
  "snippet-id": 1,
  "display-name": "foo",
  name: "foo",
  "snippet-name": "foo",
  type: "snippet",
};

const NATIVE_QUESTION_WITH_SNIPPET: NativeDatasetQuery = {
  type: "native",
  database: 1,
  native: {
    query: "select * from orders {{ foo }}",
    "template-tags": {
      foo: SNIPPET,
    },
  },
};

describe("QB Actions > initializeQB", () => {
  beforeAll(() => {
    console.warn = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const TEST_CASE = {
    SAVED_STRUCTURED_QUESTION: {
      card: createSavedStructuredCard(),
      questionType: "saved structured question",
    },
    UNSAVED_STRUCTURED_QUESTION: {
      card: createAdHocCard(),
      questionType: "ad-hoc structured question",
    },

    SAVED_NATIVE_QUESTION: {
      card: createSavedNativeCard(),
      questionType: "saved native question",
    },
    UNSAVED_NATIVE_QUESTION: {
      card: createAdHocNativeCard(),
      questionType: "unsaved native question",
    },

    STRUCTURED_MODEL: {
      card: createStructuredModelCard(),
      questionType: "structured model",
    },
    NATIVE_MODEL: {
      card: createNativeModelCard(),
      questionType: "native model",
    },
  };

  const ALL_TEST_CASES = Object.values(TEST_CASE);

  const SAVED_QUESTION_TEST_CASES = [
    TEST_CASE.SAVED_STRUCTURED_QUESTION,
    TEST_CASE.SAVED_NATIVE_QUESTION,
  ];

  const UNSAVED_QUESTION_TEST_CASES = [
    TEST_CASE.UNSAVED_STRUCTURED_QUESTION,
    TEST_CASE.UNSAVED_NATIVE_QUESTION,
  ];

  const MODEL_TEST_CASES = [TEST_CASE.STRUCTURED_MODEL, TEST_CASE.NATIVE_MODEL];

  const NATIVE_SNIPPETS_TEST_CASES = [
    {
      card: createSavedNativeCard({
        dataset_query: NATIVE_QUESTION_WITH_SNIPPET,
      }),
      questionType: "saved native question with snippets",
    },
    {
      card: createAdHocNativeCard({
        dataset_query: NATIVE_QUESTION_WITH_SNIPPET,
      }),
      questionType: "unsaved native question with snippets",
    },
  ];

  describe("common", () => {
    ALL_TEST_CASES.forEach(testCase => {
      const { card, questionType } = testCase;

      describe(questionType, () => {
        it("resets QB state before doing anything", async () => {
          const resetQBSpy = jest.spyOn(core, "resetQB");
          await setup({ card });
          expect(resetQBSpy).toHaveBeenCalledTimes(1);
        });

        it("cancels running query before doing anything", async () => {
          const cancelQuerySpy = jest.spyOn(querying, "cancelQuery");
          await setup({ card });
          expect(cancelQuerySpy).toHaveBeenCalledTimes(1);
        });

        it("fetches question metadata", async () => {
          const loadMetadataForCardSpy = jest.spyOn(
            questionActions,
            "loadMetadataForCard",
          );

          await setup({ card });

          expect(loadMetadataForCardSpy).toHaveBeenCalledTimes(1);
          expect(loadMetadataForCardSpy).toHaveBeenCalledWith(
            expect.objectContaining(card),
          );
        });

        it("does not run non-runnable question queries", async () => {
          const runQuestionQuerySpy = jest.spyOn(querying, "runQuestionQuery");
          jest.spyOn(Question.prototype, "canRun").mockReturnValue(false);

          await setup({ card });

          expect(runQuestionQuerySpy).not.toHaveBeenCalled();
        });

        it("does not run question query in notebook mode", async () => {
          const runQuestionQuerySpy = jest.spyOn(querying, "runQuestionQuery");
          const baseUrl = Urls.question(card);
          const location = getLocationForCard(card, {
            pathname: `${baseUrl}/notebook`,
          });

          await setup({ card, location });

          expect(runQuestionQuerySpy).not.toHaveBeenCalled();
        });

        it("passes object ID from params correctly", async () => {
          const params = getQueryParamsForCard(card, { objectId: 123 });
          const { result } = await setup({ card, params });
          expect(result.objectId).toBe(123);
        });

        it("passes object ID from location query params correctly", async () => {
          const location = getLocationForCard(card, {
            query: { objectId: 123 },
          });
          const { result } = await setup({ card, location });
          expect(result.objectId).toBe(123);
        });

        it("sets original card id on the card", async () => {
          const { result } = await setup({ card });
          expect(result.card.original_card_id).toBe((card as Card).id);
        });

        it("sets QB mode correctly", async () => {
          const { result } = await setup({ card });
          expect(result.uiControls.queryBuilderMode).toBe("view");
        });

        it("sets QB mode to notebook if opening /notebook route", async () => {
          const baseUrl = Urls.question(card);
          const location = getLocationForCard(card, {
            pathname: `${baseUrl}/notebook`,
          });

          const { result } = await setup({ card, location });

          expect(result.uiControls.queryBuilderMode).toBe("notebook");
        });
      });
    });
  });

  describe("saved questions and models", () => {
    [...SAVED_QUESTION_TEST_CASES, ...MODEL_TEST_CASES].forEach(testCase => {
      const { card, questionType } = testCase;

      describe(questionType, () => {
        it("fetches alerts", async () => {
          const fetchAlertsForQuestionSpy = jest.spyOn(
            alert,
            "fetchAlertsForQuestion",
          );

          await setup({ card: card });

          expect(fetchAlertsForQuestionSpy).toHaveBeenCalledWith(card.id);
        });

        it("passes object ID from params correctly", async () => {
          const params = getQueryParamsForCard(card, { objectId: 123 });
          const { result } = await setup({ card: card, params });
          expect(result.objectId).toBe(123);
        });

        it("passes object ID from location query params correctly", async () => {
          const location = getLocationForCard(card, {
            query: { objectId: 123 },
          });
          const { result } = await setup({ card: card, location });
          expect(result.objectId).toBe(123);
        });

        describe("newb modal", () => {
          it("shows modal if user has not yet seen it", async () => {
            const { result } = await setup({
              card: card,
              user: createMockUser({ is_qbnewb: true }),
            });
            expect(result.uiControls.isShowingNewbModal).toBe(true);
          });

          it("does not show modal if user has seen it", async () => {
            const { result } = await setup({
              card: card,
              user: createMockUser({ is_qbnewb: false }),
            });
            expect(result.uiControls.isShowingNewbModal).toBeFalsy();
          });
        });

        it("throws error for archived card", async () => {
          const { dispatch } = await setup({
            card: {
              ...card,
              archived: true,
            },
          });

          expect(dispatch).toHaveBeenCalledWith(
            setErrorPage(
              expect.objectContaining({ data: { error_code: "archived" } }),
            ),
          );
        });
      });
    });
  });

  describe("saved questions", () => {
    SAVED_QUESTION_TEST_CASES.forEach(testCase => {
      const { card, questionType } = testCase;

      describe(questionType, () => {
        it("locks question display", async () => {
          const { result } = await setup({ card });
          expect(result.card.displayIsLocked).toBe(true);
        });

        it("throws not found error when opening question with /model URL", async () => {
          const { dispatch } = await setup({
            card: card,
            location: { pathname: `/model/${card}` },
          });

          expect(dispatch).toHaveBeenCalledWith(
            setErrorPage(
              expect.objectContaining({ data: { error_code: "not-found" } }),
            ),
          );
        });

        it("runs question query in view mode", async () => {
          const runQuestionQuerySpy = jest.spyOn(querying, "runQuestionQuery");
          await setup({ card: card });
          expect(runQuestionQuerySpy).toHaveBeenCalledTimes(1);
        });
      });
    });
  });

  describe("unsaved questions", () => {
    UNSAVED_QUESTION_TEST_CASES.forEach(testCase => {
      const { card, questionType } = testCase;

      const ORIGINAL_CARD_ID = 321;

      function getOriginalQuestionCard(opts?: Partial<Card>): Card {
        return {
          ...card,
          ...opts,
          id: ORIGINAL_CARD_ID,
        } as Card;
      }

      function setupWithOriginalQuestion({
        originalCard,
        card,
        ...opts
      }: SetupOpts & { originalCard: Card }) {
        const q = {
          ...card,
          original_card_id: ORIGINAL_CARD_ID,
        };

        fetchMock.get(`path:/api/card/${originalCard.id}`, originalCard);

        jest
          .spyOn(CardLib, "loadCard")
          .mockReturnValueOnce(Promise.resolve({ ...originalCard }));

        return setup({ card: q, ...opts });
      }

      describe(questionType, () => {
        it("loads original card", async () => {
          const originalCard = getOriginalQuestionCard({ display: "line" });

          const { result } = await setupWithOriginalQuestion({
            card: card,
            originalCard,
          });

          expect(result.card.original_card_id).toBe(ORIGINAL_CARD_ID);
          expect(result.originalCard).toEqual(originalCard);
        });

        it("replaces card with original card if they're equal", async () => {
          const originalCard = getOriginalQuestionCard();

          const { result } = await setupWithOriginalQuestion({
            card: card,
            originalCard,
          });

          expect(result.card.original_card_id).toBeUndefined();
          expect(result.originalCard).toEqual(originalCard);
          expect(result.card).toEqual({
            ...originalCard,
            displayIsLocked: true,
          });
        });

        it("does not lock question display", async () => {
          const { result } = await setup({ card: card });
          expect(result.card.displayIsLocked).toBeFalsy();
        });

        it("does not try to fetch alerts", async () => {
          const fetchAlertsForQuestionSpy = jest.spyOn(
            alert,
            "fetchAlertsForQuestion",
          );

          await setup({ card: card });

          expect(fetchAlertsForQuestionSpy).not.toHaveBeenCalled();
        });

        it("does not show qbnewb modal", async () => {
          const { result } = await setup({
            card: card,
            user: createMockUser({ is_qbnewb: true }),
          });
          expect(result.uiControls.isShowingNewbModal).toBeFalsy();
        });

        it("handles error if couldn't deserialize card hash", async () => {
          const error = new Error("failed to deserialize card");
          jest
            .spyOn(CardLib, "deserializeCardFromUrl")
            .mockImplementation(() => {
              throw error;
            });

          const { dispatch } = await setup({ card: card });

          expect(dispatch).toHaveBeenCalledWith(setErrorPage(error));
        });
      });
    });
  });

  describe("unsaved structured questions", () => {
    const { card } = TEST_CASE.SAVED_STRUCTURED_QUESTION;

    it("runs question query in view mode", async () => {
      const runQuestionQuerySpy = jest.spyOn(querying, "runQuestionQuery");
      await setup({ card });
      expect(runQuestionQuerySpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("unsaved native questions", () => {
    const { card } = TEST_CASE.UNSAVED_NATIVE_QUESTION;

    it("doesn't run an ad-hoc native question in view mode automatically", async () => {
      const runQuestionQuerySpy = jest.spyOn(querying, "runQuestionQuery");
      await setup({ card });
      expect(runQuestionQuerySpy).not.toHaveBeenCalled();
    });
  });

  describe("models", () => {
    MODEL_TEST_CASES.forEach(testCase => {
      const { card, questionType } = testCase;

      describe(questionType, () => {
        it("doesn't lock display", async () => {
          const { result } = await setup({ card });
          expect(result.card.displayIsLocked).toBeFalsy();
        });

        it("runs question query on /query route", async () => {
          const runQuestionQuerySpy = jest.spyOn(querying, "runQuestionQuery");
          const baseUrl = Urls.question(card);
          const location = getLocationForCard(card, {
            pathname: `${baseUrl}/query`,
          });

          await setup({ card, location });

          expect(runQuestionQuerySpy).toHaveBeenCalledTimes(1);
        });

        it("runs question query on /metadata route", async () => {
          const runQuestionQuerySpy = jest.spyOn(querying, "runQuestionQuery");
          const baseUrl = Urls.question(card);
          const location = getLocationForCard(card, {
            pathname: `${baseUrl}/metadata`,
          });

          await setup({ card, location });

          expect(runQuestionQuerySpy).toHaveBeenCalledTimes(1);
        });

        it("sets UI state correctly for /query route", async () => {
          const baseUrl = Urls.question(card);
          const location = getLocationForCard(card, {
            pathname: `${baseUrl}/query`,
          });

          const { result } = await setup({ card, location });

          expect(result.uiControls.queryBuilderMode).toBe("dataset");
          expect(result.uiControls.datasetEditorTab).toBe("query");
        });

        it("sets UI state correctly for /metadata route", async () => {
          const baseUrl = Urls.question(card);
          const location = getLocationForCard(card, {
            pathname: `${baseUrl}/metadata`,
          });

          const { result } = await setup({ card, location });

          expect(result.uiControls.queryBuilderMode).toBe("dataset");
          expect(result.uiControls.datasetEditorTab).toBe("metadata");
        });
      });
    });
  });

  describe("native questions with snippets", () => {
    NATIVE_SNIPPETS_TEST_CASES.forEach(testCase => {
      const { card, questionType } = testCase;

      type SnippetsSetupOpts = Omit<SetupOpts, "card"> & {
        hasDatabaseWritePermission?: boolean;
        snippet?: unknown;
      };

      function setupSnippets({
        hasDatabaseWritePermission = true,
        snippet,
        ...opts
      }: SnippetsSetupOpts) {
        const clone = { ...card };

        jest
          .spyOn(NativeQuery.prototype, "readOnly")
          .mockReturnValue(!hasDatabaseWritePermission);
        jest
          .spyOn(NativeQuery.prototype, "isEditable")
          .mockReturnValue(hasDatabaseWritePermission);

        Snippets.actions.fetchList = jest.fn();
        Snippets.selectors.getList = jest
          .fn()
          .mockReturnValue(snippet ? [snippet] : []);

        return setup({ card: clone, ...opts });
      }

      describe(questionType, () => {
        it("loads snippets if have DB write permissions", async () => {
          await setupSnippets({ hasDatabaseWritePermission: true });
          expect(Snippets.actions.fetchList).toHaveBeenCalledTimes(1);
        });

        it("does not load snippets if missing DB write permissions", async () => {
          Databases.selectors.getObject = jest.fn().mockReturnValue({
            native_permissions: "none",
          });
          Snippets.actions.fetchList = jest.fn();
          Snippets.selectors.getList = jest.fn().mockReturnValue([SNIPPET]);

          await setupSnippets({ hasDatabaseWritePermission: false });

          expect(Snippets.actions.fetchList).not.toHaveBeenCalled();
        });

        it("replaces snippet names with fresh ones from the backend", async () => {
          const { result, metadata } = await setupSnippets({
            snippet: {
              id: SNIPPET["snippet-id"],
              name: "bar",
            },
          });
          const formattedQuestion = new Question(result.card, metadata);
          const query = formattedQuestion.query() as NativeQuery;

          expect(query.queryText().toLowerCase()).toBe(
            "select * from orders {{snippet: bar}}",
          );
        });
      });
    });
  });

  describe("blank question", () => {
    type BlankSetupOpts = Omit<BaseSetupOpts, "location" | "params"> & {
      db?: DatabaseId;
      table?: TableId;
      segment?: number;
      metric?: number;
    };

    function setupBlank({
      db,
      table,
      segment,
      metric,
      ...opts
    }: BlankSetupOpts = {}) {
      const hashParams = [
        db ? `db=${db}` : "",
        table ? `table=${table}` : "",
        segment ? `segment=${segment}` : "",
        metric ? `metric=${metric}` : "",
      ].filter(Boolean);

      let hash = hashParams.join("&");
      if (hash) {
        hash = "#?" + hash;
      }

      const location: LocationDescriptorObject = {
        pathname: "/question",
        hash,
      };

      const params = {
        db: db ? String(db) : undefined,
        table: table ? String(table) : undefined,
        segment: segment ? String(segment) : undefined,
        metric: metric ? String(metric) : undefined,
      };

      return baseSetup({ location, params, ...opts });
    }

    async function setupOrdersTable(
      opts: Omit<BlankSetupOpts, "db" | "table"> = {},
    ) {
      const { result, metadata, ...rest } = await setupBlank({
        db: SAMPLE_DB_ID,
        table: ORDERS_ID,
        ...opts,
      });

      const question = new Question(result.card, metadata);
      const query = question.query() as StructuredQuery;

      return {
        question,
        query,
        result,
        metadata,
        ...rest,
      };
    }

    it("constructs a card based on provided 'db' param", async () => {
      const expectedCard = Question.create({
        databaseId: SAMPLE_DB_ID,
      }).card();

      const { result, metadata } = await setupBlank({ db: SAMPLE_DB_ID });
      const question = new Question(result.card, metadata);
      const query = question.query() as StructuredQuery;

      expect(result.card).toEqual(expectedCard);
      expect(query.sourceTableId()).toBe(null);
      expect(result.originalCard).toBeUndefined();
    });

    it("constructs a card based on provided 'db' and 'table' params", async () => {
      const { result, metadata } = await setupOrdersTable();
      const expectedCard = metadata.table(ORDERS_ID)?.question().card();

      expect(result.card).toEqual(expectedCard);
      expect(result.originalCard).toBeUndefined();
    });

    it("applies 'segment' param correctly", async () => {
      const SEGMENT_ID = 777;

      const { query } = await setupOrdersTable({ segment: SEGMENT_ID });
      const [filter] = query.filters();

      expect(filter.raw()).toEqual(["segment", SEGMENT_ID]);
    });

    it("applies 'metric' param correctly", async () => {
      const METRIC_ID = 777;

      const { query } = await setupOrdersTable({ metric: METRIC_ID });
      const [aggregation] = query.aggregations();

      expect(aggregation.raw()).toEqual(["metric", METRIC_ID]);
    });

    it("opens summarization sidebar if metric is applied", async () => {
      const METRIC_ID = 777;
      const { result } = await setupOrdersTable({ metric: METRIC_ID });
      expect(result.uiControls.isShowingSummarySidebar).toBe(true);
    });

    it("applies both 'metric' and 'segment' params", async () => {
      const SEGMENT_ID = 111;
      const METRIC_ID = 222;

      const { query } = await setupOrdersTable({
        segment: SEGMENT_ID,
        metric: METRIC_ID,
      });
      const [filter] = query.filters();
      const [aggregation] = query.aggregations();

      expect(filter.raw()).toEqual(["segment", SEGMENT_ID]);
      expect(aggregation.raw()).toEqual(["metric", METRIC_ID]);
    });

    it("fetches question metadata", async () => {
      const loadMetadataForCardSpy = jest.spyOn(
        questionActions,
        "loadMetadataForCard",
      );

      const { question } = await setupOrdersTable();

      expect(loadMetadataForCardSpy).toHaveBeenCalledTimes(1);
      expect(loadMetadataForCardSpy).toHaveBeenCalledWith(
        expect.objectContaining(question.card()),
      );
    });

    it("runs question query", async () => {
      const runQuestionQuerySpy = jest.spyOn(querying, "runQuestionQuery");
      await setupOrdersTable();
      expect(runQuestionQuerySpy).toHaveBeenCalledTimes(1);
    });

    it("does not lock question display", async () => {
      const { result } = await setupOrdersTable();
      expect(result.card.displayIsLocked).toBeFalsy();
    });

    it("does not try to fetch alerts", async () => {
      const fetchAlertsForQuestionSpy = jest.spyOn(
        alert,
        "fetchAlertsForQuestion",
      );

      await setupOrdersTable();

      expect(fetchAlertsForQuestionSpy).not.toHaveBeenCalled();
    });

    it("does not show qbnewb modal", async () => {
      const { result } = await setupOrdersTable({
        user: createMockUser({ is_qbnewb: true }),
      });
      expect(result.uiControls.isShowingNewbModal).toBeFalsy();
    });
  });
});
