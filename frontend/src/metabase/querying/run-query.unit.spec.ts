import fetchMock from "fetch-mock";

import { getMainStore } from "__support__/entities-store";
import { createMockEntitiesState } from "__support__/store";
import { waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";
import type {
  Card,
  DashCardId,
  DashboardId,
  UnsavedCard,
} from "metabase-types/api";
import {
  createMockCard,
  createMockDataset,
  createMockStructuredDatasetQuery,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { runQuestionQuery } from "./run-query";

const MOCK_QUERY = createMockStructuredDatasetQuery({
  database: SAMPLE_DB_ID,
  query: {
    "source-table": ORDERS_ID,
  },
});

function createMockMetadata(card?: Card) {
  const database = createSampleDatabase();
  const state = createMockState({
    entities: createMockEntitiesState({
      databases: [database],
      questions: card ? [card] : [],
    }),
  });
  return getMetadata(state);
}

type DashboardAwareCard = Card & {
  dashboardId?: DashboardId;
  dashcardId?: DashCardId;
};

function createMockSavedQuestion(card?: Partial<DashboardAwareCard>) {
  const savedCard = createMockCard({ dataset_query: MOCK_QUERY, ...card });
  return createMockMetadata(savedCard).question(savedCard.id) as Question;
}

function createMockAdHocQuestion(card?: Partial<UnsavedCard>) {
  const unsavedCard = createMockUnsavedCard({
    dataset_query: MOCK_QUERY,
    ...card,
  });
  return new Question(unsavedCard, createMockMetadata());
}

function getQueryEndpointPath(question: Question) {
  const isPivot = question.display() === "pivot";
  const { dashboardId, dashcardId } = question.card();
  const isDashboard = dashboardId != null && dashcardId != null;

  if (!question.isSaved()) {
    return isPivot ? "path:/api/dataset/pivot" : "path:/api/dataset";
  }

  const id = question.id();

  if (isDashboard) {
    return isPivot
      ? `path:/api/dashboard/pivot/${dashboardId}/dashcard/${dashcardId}/card/${id}/query`
      : `path:/api/dashboard/${dashboardId}/dashcard/${dashcardId}/card/${id}/query`;
  }

  return isPivot
    ? `path:/api/card/pivot/${question.id()}/query`
    : `path:/api/card/${question.id()}/query`;
}

function getRtkStore() {
  return getMainStore(createMockState());
}

async function setupRunQuestionQuery(question: Question) {
  const mockResult = createMockDataset();
  fetchMock.post(getQueryEndpointPath(question), mockResult);
  const result = await runQuestionQuery(question, {
    dispatch: getRtkStore().dispatch,
    signal: new AbortController().signal,
  });
  return { result, mockResult };
}

describe("metabase/querying/run-query > runQuestionQuery", () => {
  describe("saved questions", () => {
    it("should use the card query endpoint", async () => {
      const question = createMockSavedQuestion();

      await setupRunQuestionQuery(question);

      const call = fetchMock.callHistory.lastCall(
        `path:/api/card/${question.id()}/query`,
      );
      expect(await call?.request?.json()).toEqual({
        collection_preview: false,
        ignore_cache: false,
        parameters: [],
      });
    });

    it("should return query results", async () => {
      const question = createMockSavedQuestion();
      const { result, mockResult } = await setupRunQuestionQuery(question);
      expect(result).toEqual([mockResult]);
    });

    it("should use the pivot endpoint for pivot tables", async () => {
      const question = createMockSavedQuestion({ display: "pivot" });
      await setupRunQuestionQuery(question);
      const call = fetchMock.callHistory.lastCall(
        `path:/api/card/pivot/${question.id()}/query`,
      );
      expect(await call?.request?.json()).toEqual({
        collection_preview: false,
        ignore_cache: false,
        parameters: [],
      });
    });

    it("should use the dashboard card query endpoint in dashboard context", async () => {
      const dashboardId = 2;
      const dashcardId = 3;
      const question = createMockSavedQuestion({ dashboardId, dashcardId });

      await setupRunQuestionQuery(question);

      const call = fetchMock.callHistory.lastCall(
        `path:/api/dashboard/${dashboardId}/dashcard/${dashcardId}/card/${question.id()}/query`,
      );
      expect(await call?.request?.json()).toEqual({
        collection_preview: false,
        ignore_cache: false,
        parameters: [],
      });
    });

    it("should use the dashboard pivot card query endpoint in dashboard context", async () => {
      const dashboardId = 2;
      const dashcardId = 3;
      const question = createMockSavedQuestion({
        dashboardId,
        dashcardId,
        display: "pivot",
      });

      await setupRunQuestionQuery(question);

      const call = fetchMock.callHistory.lastCall(
        `path:/api/dashboard/pivot/${dashboardId}/dashcard/${dashcardId}/card/${question.id()}/query`,
      );
      expect(await call?.request?.json()).toEqual({
        collection_preview: false,
        ignore_cache: false,
        parameters: [],
      });
    });
  });

  describe("ad-hoc questions", () => {
    it("should use the dataset endpoint", async () => {
      const question = createMockAdHocQuestion();

      await setupRunQuestionQuery(question);

      const call = fetchMock.callHistory.lastCall("path:/api/dataset");
      expect(await call?.request?.json()).toEqual({
        ...question.datasetQuery(),
        parameters: [],
      });
    });

    it("should use the pivot dataset endpoint", async () => {
      const question = createMockAdHocQuestion({ display: "pivot" });

      await setupRunQuestionQuery(question);

      const call = fetchMock.callHistory.lastCall("path:/api/dataset/pivot");
      expect(await call?.request?.json()).toEqual({
        ...question.datasetQuery(),
        parameters: [],
        pivot_cols: [],
        pivot_rows: [],
        show_column_totals: true,
        show_row_totals: true,
      });
    });

    it("should return query results", async () => {
      const question = createMockAdHocQuestion();
      const { result, mockResult } = await setupRunQuestionQuery(question);
      expect(result).toEqual([mockResult]);
    });

    it("runs `internal` queries (e.g. audit pages) without throwing in the pivot check", async () => {
      // `internal` queries aren't supported by Lib, so `question.database()`
      // throws for them. The pivot-endpoint check must not call it for a
      // non-pivot card, otherwise the query never reaches `/api/dataset` (the
      // audit "Erroring Questions" table renders nothing).
      const question = createMockAdHocQuestion({
        dataset_query: {
          type: "internal",
          fn: "metabase-enterprise.audit-app.pages.queries/bad-table",
          args: [null, null, null, "last_run_at", "desc"],
        } as unknown as UnsavedCard["dataset_query"],
      });

      const { result, mockResult } = await setupRunQuestionQuery(question);

      expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(1);
      expect(result).toEqual([mockResult]);
    });
  });

  describe("error handling", () => {
    it("should convert 4xx errors to successful responses with error data (saved question)", async () => {
      const question = createMockSavedQuestion();
      const errorData = {
        error: "Query failed",
        error_type: "client-error",
        status: "failed",
      };

      fetchMock.post(getQueryEndpointPath(question), {
        status: 400,
        body: errorData,
      });

      const result = await runQuestionQuery(question, {
        dispatch: getRtkStore().dispatch,
        signal: new AbortController().signal,
      });

      // 4xx errors should be returned as successful responses with error data
      expect(result).toEqual([errorData]);
    });

    it("should convert 4xx errors to successful responses with error data (ad-hoc question)", async () => {
      const question = createMockAdHocQuestion();
      const errorData = {
        error: "Permission denied",
        error_type: "permission-error",
        status: "failed",
      };

      fetchMock.post(getQueryEndpointPath(question), {
        status: 403,
        body: errorData,
      });

      const result = await runQuestionQuery(question, {
        dispatch: getRtkStore().dispatch,
        signal: new AbortController().signal,
      });

      // 4xx errors should be returned as successful responses with error data
      expect(result).toEqual([errorData]);
    });

    it("should throw on 5xx server errors", async () => {
      const question = createMockSavedQuestion();

      fetchMock.post(getQueryEndpointPath(question), {
        status: 500,
        body: { error: "Internal server error" },
      });

      // 5xx errors should still throw
      await expect(
        runQuestionQuery(question, {
          dispatch: getRtkStore().dispatch,
          signal: new AbortController().signal,
        }),
      ).rejects.toMatchObject({
        status: 500,
      });
    });

    it("rejects with AbortError when the signal aborts (ad-hoc question)", async () => {
      // Guards the RTK Query cancellation path: aborting the signal must
      // abort the underlying `/api/dataset` request and reject with the
      // standard `DOMException` AbortError that `queryErrored` and other
      // callers identify via `isAbortError`.
      const question = createMockAdHocQuestion();
      fetchMock.post(
        getQueryEndpointPath(question),
        new Promise(() => undefined),
      );

      const controller = new AbortController();
      const runPromise = runQuestionQuery(question, {
        dispatch: getRtkStore().dispatch,
        signal: controller.signal,
      });

      controller.abort();

      await expect(runPromise).rejects.toMatchObject({ name: "AbortError" });
    });

    it("rejects with AbortError when the signal aborts (saved question)", async () => {
      // The saved-card path dispatches an RTK Query endpoint; aborting the
      // signal must abort the underlying `/api/card/:id/query` request and
      // reject with the standard `DOMException` AbortError that `queryErrored`
      // and other callers identify via `isAbortError`.
      const question = createMockSavedQuestion();
      fetchMock.post(
        getQueryEndpointPath(question),
        new Promise(() => undefined),
      );

      const controller = new AbortController();
      const runPromise = runQuestionQuery(question, {
        dispatch: getRtkStore().dispatch,
        signal: controller.signal,
      });

      controller.abort();

      await expect(runPromise).rejects.toMatchObject({ name: "AbortError" });
    });

    it("isolates concurrent identical saved-card queries so cancelling one doesn't abort the other", async () => {
      // Two callers running the same saved card must not co-subscribe to a
      // single RTK Query request: otherwise one caller aborting (e.g. the SDK
      // cancelling the previous run on every re-run) would abort the other's
      // query too, hanging/blanking the result. A unique `_refetchDeps` per
      // call keeps the cache keys — and therefore the requests — distinct.
      const question = createMockSavedQuestion();
      const path = getQueryEndpointPath(question);
      fetchMock.post(path, createMockDataset(), { delay: 50 });
      const { dispatch } = getRtkStore();

      const abortController = new AbortController();
      const cancelledRun = runQuestionQuery(question, {
        dispatch,
        signal: abortController.signal,
      }).catch((error) => error);
      const liveRun = runQuestionQuery(question, {
        dispatch,
        signal: new AbortController().signal,
      });

      // Wait for both requests to actually be in flight before aborting:
      // independent cache keys ⇒ two real requests, not one shared (deduped)
      // one. Aborting synchronously would short-circuit the cancelled run
      // before the client ever issues its fetch, so we'd never observe whether
      // the two queries were deduped.
      await waitFor(() =>
        expect(fetchMock.callHistory.calls(path)).toHaveLength(2),
      );

      abortController.abort();

      await expect(liveRun).resolves.toHaveLength(1);
      await cancelledRun;

      // Aborting the cancelled run must not have disturbed the live run's
      // separate request.
      expect(fetchMock.callHistory.calls(path)).toHaveLength(2);
    });

    it("normalizes plain-text 4xx error bodies into a structured error result (EMB-1659)", async () => {
      // Embed API checks (e.g. `/api/embed/card/:token/query`) reject with a
      // plain-text body when a locked param is missing from the JWT. Without
      // normalization the result reaches the visualization as a bare string,
      // so `result?.error` is undefined and the UI falls through to an empty
      // state instead of showing the message.
      const question = createMockSavedQuestion();
      const errorMessage = "You must specify a value for category in the JWT.";

      fetchMock.post(getQueryEndpointPath(question), {
        status: 400,
        body: errorMessage,
      });

      const result = await runQuestionQuery(question, {
        dispatch: getRtkStore().dispatch,
        signal: new AbortController().signal,
      });

      expect(result).toEqual([{ error: errorMessage, status: 400 }]);
    });
  });
});
