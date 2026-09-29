import { act, renderHookWithProviders } from "__support__/ui";
import Question from "metabase-lib/v1/Question";
import { createMockNativeDatasetQuery } from "metabase-types/api/mocks/query";

import type { QueryEditorUiState } from "../../types";

import { useQueryResults } from "./use-query-results";

const mockAbort = jest.fn();
const mockTrigger = jest.fn(() => {
  // The request never resolves, so the query is still running when the test cancels it.
  const action: any = new Promise(() => {});
  action.abort = mockAbort;
  return action;
});

jest.mock("metabase/api", () => {
  const actual = jest.requireActual("metabase/api");
  return {
    ...actual,
    useLazyGetAdhocQueryQuery: () => [mockTrigger, { isFetching: true }],
  };
});

const NATIVE_QUERY = createMockNativeDatasetQuery({
  native: { query: "SELECT pg_sleep(10)" },
});

const INITIAL_UI_STATE: QueryEditorUiState = {
  lastRunResult: null,
  lastRunQuery: null,
  selectionRange: [],
  modalSnippet: null,
  modalType: null,
  sidebarType: null,
};

describe("useQueryResults > cancel (metabase#64474)", () => {
  beforeEach(() => {
    mockAbort.mockClear();
    mockTrigger.mockClear();
  });

  it("aborts the in-flight query when cancelQuery is called", () => {
    const question = Question.create({
      dataset_query: NATIVE_QUERY,
      metadata: undefined,
    });

    const { result } = renderHookWithProviders(
      () => useQueryResults(question, INITIAL_UI_STATE, jest.fn()),
      {},
    );

    act(() => {
      void result.current.runQuery();
    });

    expect(mockTrigger).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.cancelQuery();
    });

    expect(mockAbort).toHaveBeenCalledTimes(1);
  });
});
