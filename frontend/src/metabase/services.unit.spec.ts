import fetchMock from "fetch-mock";

import { createMockEntitiesState } from "__support__/store";
import { defer } from "metabase/lib/promise";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";
import type {
  Card,
  DashboardId,
  DashCardId,
  UnsavedCard,
} from "metabase-types/api";
import {
  createMockCard,
  createMockUnsavedCard,
  createMockDataset,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  ORDERS_ID,
  SAMPLE_DB_ID,
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

      const call = fetchMock.lastCall(`path:/api/card/${question.id()}/query`);
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
      const call = fetchMock.lastCall(
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

      const call = fetchMock.lastCall(
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

      const call = fetchMock.lastCall(
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

      const call = fetchMock.lastCall("path:/api/dataset");
      expect(await call?.request?.json()).toEqual({
        ...question.datasetQuery(),
        parameters: [],
      });
    });

    it("should use the pivot dataset endpoint", async () => {
      const question = createMockAdHocQuestion({ display: "pivot" });

      await setupRunQuestionQuery(question);

      const call = fetchMock.lastCall("path:/api/dataset/pivot");
      expect(await call?.request?.json()).toEqual({
        ...question.datasetQuery(),
        parameters: [],
      });
    });

    it("should return query results", async () => {
      const question = createMockAdHocQuestion();
      const { result, mockResult } = await setupRunQuestionQuery(question);
      expect(result).toEqual([mockResult]);
    });
  });
});
