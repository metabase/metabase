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

import { buildBlockQuery, createBlock, getBlockQuestion } from "./blocks";
import { getRequestKey, useBlockResult } from "./use-block-result";
import { getSummaryBase } from "./utils";

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
  question: Question | null;
  refreshKey?: number;
}

function setup({ question, refreshKey = 0 }: SetupOpts) {
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
    ({ question, refreshKey = 0 }: SetupOpts) =>
      useBlockResult(question, refreshKey),
    { initialProps: { question, refreshKey } },
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

describe("useBlockResult", () => {
  it("doesn't run a block that can't run yet", () => {
    const { result } = setup({ question: null });

    expect(result.current.series).toBeNull();
    expect(result.current.isRunning).toBe(false);
    expect(getQueryCalls()).toHaveLength(0);
  });

  it("keeps the current result when only visualization settings change", async () => {
    const question = createQuestion();
    const { result, rerender } = setup({ question });
    await waitFor(() => expect(result.current.series).not.toBeNull());
    expect(getQueryCalls()).toHaveLength(1);

    const nextQuestion = question.updateSettings({ "table.row_index": true });
    rerender({ question: nextQuestion, refreshKey: 0 });

    expect(result.current.series?.card.visualization_settings).toEqual(
      nextQuestion.card().visualization_settings,
    );
    expect(result.current.isRunning).toBe(false);
    expect(getQueryCalls()).toHaveLength(1);
  });

  it("keeps showing the previous result, with its own card, while the changed query runs", async () => {
    const question = createQuestion();
    const { result, rerender } = setup({ question });
    await waitFor(() => expect(result.current.series).not.toBeNull());

    rerender({
      question: createQuestion({ limit: 10 }).setDisplay("bar"),
      refreshKey: 0,
    });

    expect(result.current.isRunning).toBe(true);
    expect(result.current.series?.card.display).toBe("table");
    await waitFor(() => expect(result.current.isRunning).toBe(false));
    expect(result.current.series?.card.display).toBe("bar");
    expect(getQueryCalls()).toHaveLength(2);
  });

  it("treats a rebuilt block query as the same request", () => {
    const dataQuestion = createQuestion();
    const base = getSummaryBase(dataQuestion.query());
    const block = createBlock(base, []);
    const buildQuestion = () => {
      const { query } = buildBlockQuery(base, block);
      return query && getBlockQuestion(dataQuestion, base, block, query);
    };

    expect(getRequestKey(buildQuestion())).toBe(getRequestKey(buildQuestion()));
  });

  it("runs the query again when the refresh key changes", async () => {
    const question = createQuestion();
    const { result, rerender } = setup({ question });
    await waitFor(() => expect(result.current.series).not.toBeNull());

    rerender({ question, refreshKey: 1 });

    await waitFor(() => expect(getQueryCalls()).toHaveLength(2));
    await waitFor(() => expect(result.current.isRunning).toBe(false));
  });

  it("runs the pivot query when the display switches to a pivot table", async () => {
    const question = createQuestion();
    const { result, rerender } = setup({ question });
    await waitFor(() => expect(result.current.series).not.toBeNull());

    rerender({ question: question.setDisplay("pivot"), refreshKey: 0 });

    await waitFor(() => expect(getPivotQueryCalls()).toHaveLength(1));
    await waitFor(() => expect(result.current.isRunning).toBe(false));
    expect(getQueryCalls()).toHaveLength(1);
  });
});
