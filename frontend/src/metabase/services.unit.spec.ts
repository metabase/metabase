import fetchMock from "fetch-mock";

import { createMockEntitiesState } from "__support__/store";
import { defer } from "metabase/lib/promise";
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
import { createMockState } from "metabase-types/store/mocks";

import { runQuestionQuery } from "./services";

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

async function setupRunQuestionQuery(question: Question) {
  const mockResult = createMockDataset();
  fetchMock.post(getQueryEndpointPath(question), mockResult);
  const result = await runQuestionQuery(question, { cancelDeferred: defer() });
  return { result, mockResult };
}

describe("metabase/services > runQuestionQuery", () => {
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
        cancelDeferred: defer(),
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
        cancelDeferred: defer(),
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
        runQuestionQuery(question, { cancelDeferred: defer() }),
      ).rejects.toMatchObject({
        status: 500,
      });
    });
  });
});
