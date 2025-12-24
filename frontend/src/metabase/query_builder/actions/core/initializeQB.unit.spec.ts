import fetchMock from "fetch-mock";
import type { LocationDescriptorObject } from "history";

import { createMockEntitiesState } from "__support__/store";
import { Databases } from "metabase/entities/databases";
import { Snippets } from "metabase/entities/snippets";
import * as CardLib from "metabase/lib/card";
import { checkNotNull } from "metabase/lib/types";
import * as Urls from "metabase/lib/urls";
import * as questionActions from "metabase/questions/actions";
import { setErrorPage } from "metabase/redux/app";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type {
  Card,
  DatabaseId,
  NativeDatasetQuery,
  TableId,
  TemplateTag,
  UnsavedCard,
  User,
} from "metabase-types/api";
import {
  createMockSegment,
  createMockUser,
  createMockUserPermissions,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createAdHocCard,
  createAdHocNativeCard,
  createNativeModelCard,
  createSampleDatabase,
  createSavedNativeCard,
  createSavedStructuredCard,
  createStructuredModelCard,
} from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

import * as querying from "../querying";

import * as cardActions from "./card";
import * as core from "./core";
import { initializeQB } from "./initializeQB";

type DisplayLock = { displayIsLocked?: boolean };
type TestCard = (Card & DisplayLock) | (UnsavedCard & DisplayLock);

type BaseSetupOpts = {
  user?: User | null;
  location: LocationDescriptorObject;
  params: Record<string, unknown>;
  hasDataPermissions?: boolean;
};

const SEGMENT = createMockSegment();

async function baseSetup({
  user,
  location,
  params,
  hasDataPermissions = true,
}: BaseSetupOpts) {
  jest.useFakeTimers();
  const state = createMockState({
    entities: createMockEntitiesState({
      databases: hasDataPermissions ? [createSampleDatabase()] : [],
      segments: [SEGMENT],
    }),
    currentUser:
      user === undefined
        ? createMockUser({
            permissions: createMockUserPermissions({
              can_create_queries: hasDataPermissions,
            }),
          })
        : user,
  });

  const metadata = getMetadata(state);
  const getState = () => state;

  const dispatch = jest.fn();
  await initializeQB(location, params)(dispatch, getState);
  jest.runAllTimers();

  const actions = dispatch.mock.calls.find(
    (call) => call[0]?.type === "metabase/qb/INITIALIZE_QB",
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

  jest
    .spyOn(cardActions, "loadCard")
    .mockReturnValue(Promise.resolve({ ...card }));

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
    ALL_TEST_CASES.forEach((testCase) => {
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
          const baseUrl = Urls.question(card as Card);
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
          const baseUrl = Urls.question(card as Card);
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
    [...SAVED_QUESTION_TEST_CASES, ...MODEL_TEST_CASES].forEach((testCase) => {
      const { card, questionType } = testCase;

      describe(questionType, () => {
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

        describe("archived card", () => {
          const baseParams = { card: { ...card, archived: true } };
          const archiveError = setErrorPage(
            expect.objectContaining({ data: { error_code: "archived" } }),
          );

          it("throws error for archived card if user is not logged in", async () => {
            const loggedOut = await setup({ ...baseParams, user: null });
            expect(loggedOut.dispatch).toHaveBeenCalledWith(archiveError);
          });

          it("does not throw error for archived card if user is logged in", async () => {
            const loggedIn = await setup({ ...baseParams });
            expect(loggedIn.dispatch).not.toHaveBeenCalledWith(archiveError);
          });
        });
      });
    });
  });

  describe("saved questions", () => {
    SAVED_QUESTION_TEST_CASES.forEach((testCase) => {
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
    UNSAVED_QUESTION_TEST_CASES.forEach((testCase) => {
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
          .spyOn(cardActions, "loadCard")
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
    MODEL_TEST_CASES.forEach((testCase) => {
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

        it("sets UI state correctly for /columns route", async () => {
          const baseUrl = Urls.question(card);
          const location = getLocationForCard(card, {
            pathname: `${baseUrl}/columns`,
          });

          const { result } = await setup({ card, location });

          expect(result.uiControls.queryBuilderMode).toBe("dataset");
          expect(result.uiControls.datasetEditorTab).toBe("columns");
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
    NATIVE_SNIPPETS_TEST_CASES.forEach((testCase) => {
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

        Snippets.actions.fetchList = jest.fn();
        Snippets.selectors.getList = jest
          .fn()
          .mockReturnValue(snippet ? [snippet] : []);

        return setup({
          card: clone,
          hasDataPermissions: hasDatabaseWritePermission,
          ...opts,
        });
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
          const query = formattedQuestion.legacyNativeQuery() as NativeQuery;

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
    };

    function setupBlank({ db, table, segment, ...opts }: BlankSetupOpts = {}) {
      const hashParams = [
        db ? `db=${db}` : "",
        table ? `table=${table}` : "",
        segment ? `segment=${segment}` : "",
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
      const query = question.query();

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
        DEPRECATED_RAW_MBQL_databaseId: SAMPLE_DB_ID,
      }).card();

      const { result, metadata } = await setupBlank({ db: SAMPLE_DB_ID });
      const question = new Question(result.card, metadata);
      const query = question.query();

      expect(
        Lib.areLegacyQueriesEqual(
          result.card.dataset_query,
          expectedCard.dataset_query,
        ),
      ).toBe(true);
      expect(Lib.sourceTableOrCardId(query)).toBe(null);
      expect(result.originalCard).toBeUndefined();
    });

    it("constructs a card based on provided 'db' and 'table' params", async () => {
      const { result, metadata } = await setupOrdersTable();
      const expectedCard = checkNotNull(
        metadata.table(ORDERS_ID)?.question().card(),
      );

      expect(
        Lib.areLegacyQueriesEqual(
          result.card.dataset_query,
          expectedCard.dataset_query,
        ),
      ).toBe(true);
      expect(result.originalCard).toBeUndefined();
    });

    it("applies 'segment' param correctly", async () => {
      const { query } = await setupOrdersTable({ segment: SEGMENT.id });
      const stageIndex = -1;
      const [filter] = Lib.filters(query, stageIndex);
      const filterInfo = Lib.displayInfo(query, stageIndex, filter);

      expect(filterInfo.displayName).toEqual(SEGMENT.name);
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

    it("does not show qbnewb modal", async () => {
      const { result } = await setupOrdersTable({
        user: createMockUser({ is_qbnewb: true }),
      });
      expect(result.uiControls.isShowingNewbModal).toBeFalsy();
    });
  });
});
