import { setupCardDataset } from "__support__/server-mocks";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import Question from "metabase-lib/v1/Question";
import type { Dataset } from "metabase-types/api";
import { createMockDataset } from "metabase-types/api/mocks";
import { createMockNativeDatasetQuery } from "metabase-types/api/mocks/query";

import type { QueryEditorUiState } from "../../types";

import { useQueryResults } from "./use-query-results";

const NATIVE_QUERY = createMockNativeDatasetQuery({
  native: { query: "SELECXT 1" },
});

const ERROR_DATASET = createMockDataset({
  error: 'ERROR: syntax error at or near "SELECXT"',
  error_type: "invalid-query",
  status: "failed",
});

function setup({
  mockResponse,
  onChangeUiState,
}: {
  mockResponse: { status?: number; dataset?: Dataset };
  onChangeUiState: (uiState: QueryEditorUiState) => void;
}) {
  setupCardDataset({
    status: mockResponse.status,
    dataset: mockResponse.dataset,
  });

  const question = Question.create({
    dataset_query: NATIVE_QUERY,
    metadata: undefined,
  });

  const initialUiState: QueryEditorUiState = {
    lastRunResult: null,
    lastRunQuery: null,
    selectionRange: [],
    modalSnippet: null,
    modalType: null,
    sidebarType: null,
  };

  const { result } = renderHookWithProviders(
    () => useQueryResults(question, initialUiState, onChangeUiState),
    {},
  );

  return { result, onChangeUiState };
}

describe("useQueryResults", () => {
  it("should propagate a successful dataset result", async () => {
    const successDataset = createMockDataset();
    const onChangeUiState = jest.fn();
    const { result } = setup({
      mockResponse: { dataset: successDataset },
      onChangeUiState,
    });

    await result.current.runQuery();

    await waitFor(() => {
      expect(onChangeUiState).toHaveBeenCalled();
    });

    const call = onChangeUiState.mock.calls[0][0];
    expect(call.lastRunResult).toEqual(successDataset);
    expect(call.lastRunQuery).toEqual(NATIVE_QUERY);
  });

  it("should propagate error.data as lastRunResult when the API returns a 400", async () => {
    const onChangeUiState = jest.fn();
    const { result } = setup({
      onChangeUiState,
      mockResponse: { status: 400, dataset: ERROR_DATASET },
    });

    await result.current.runQuery();

    await waitFor(() => {
      expect(onChangeUiState).toHaveBeenCalled();
    });

    const call = onChangeUiState.mock.calls[0][0];
    expect(call.lastRunResult).toEqual(ERROR_DATASET);
    expect(call.lastRunResult.error).toBe(
      'ERROR: syntax error at or near "SELECXT"',
    );
    expect(call.lastRunQuery).toEqual(NATIVE_QUERY);
  });
});
