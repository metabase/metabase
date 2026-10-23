import fetchMock from "fetch-mock";

import { setupCardDataset } from "__support__/server-mocks";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import { SAMPLE_METADATA } from "metabase-lib/query/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { StructuredQuery } from "metabase-types/api";
import {
  createMockCard,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";
import { PRODUCTS_ID, SAMPLE_DB_ID } from "metabase-types/api/mocks/presets";

import { useSummaryResult } from "./use-summary-result";

function createQuestion(query: StructuredQuery = {}) {
  return new Question(
    createMockCard({
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: { "source-table": PRODUCTS_ID, ...query },
      },
    }),
    SAMPLE_METADATA,
  ).setDisplay("table");
}

interface SetupOpts {
  question: Question;
}

function setup({ question }: SetupOpts) {
  setupCardDataset({
    dataset: createMockDataset({
      data: createMockDatasetData({ rows: [[200]] }),
    }),
  });
  fetchMock.post(
    "path:/api/dataset/pivot",
    createMockDataset({ data: createMockDatasetData({ rows: [[200]] }) }),
  );

  return renderHookWithProviders(
    ({ question }: SetupOpts) => useSummaryResult(question, true),
    { initialProps: { question } },
  );
}

function getQueryCalls() {
  return fetchMock.callHistory.calls("path:/api/dataset", { method: "POST" });
}

function getPivotQueryCalls() {
  return fetchMock.callHistory.calls("path:/api/dataset/pivot", {
    method: "POST",
  });
}

describe("useSummaryResult", () => {
  it("keeps the current result when only visualization settings change", async () => {
    const question = createQuestion();
    const { result, rerender } = setup({ question });
    await waitFor(() => expect(result.current.result).toBeDefined());
    expect(getQueryCalls()).toHaveLength(1);

    rerender({
      question: question.updateSettings({ "table.row_index": true }),
    });

    expect(result.current.result).toBeDefined();
    expect(result.current.isRunning).toBe(false);
    expect(getQueryCalls()).toHaveLength(1);
  });

  it("runs the query again when the query changes", async () => {
    const question = createQuestion();
    const { result, rerender } = setup({ question });
    await waitFor(() => expect(result.current.result).toBeDefined());

    rerender({ question: createQuestion({ limit: 10 }) });

    expect(result.current.result).toBeUndefined();
    await waitFor(() => expect(result.current.result).toBeDefined());
    expect(getQueryCalls()).toHaveLength(2);
  });

  it("runs the pivot query when the display switches to a pivot table", async () => {
    const question = createQuestion();
    const { result, rerender } = setup({ question });
    await waitFor(() => expect(result.current.result).toBeDefined());

    rerender({ question: question.setDisplay("pivot") });

    await waitFor(() => expect(getPivotQueryCalls()).toHaveLength(1));
    await waitFor(() => expect(result.current.result).toBeDefined());
    expect(getQueryCalls()).toHaveLength(1);
  });
});
