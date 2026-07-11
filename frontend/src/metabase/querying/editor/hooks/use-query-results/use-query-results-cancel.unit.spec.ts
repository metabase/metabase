import { act, renderHookWithProviders } from "__support__/ui";
import Question from "metabase-lib/v1/Question";
import { createMockNativeDatasetQuery } from "metabase-types/api/mocks/query";

import type { QueryEditorUiState } from "../../types";

import { useQueryResults } from "./use-query-results";

// Witness for metabase#64474: cancelling a running SQL (transform) preview must
// abort the in-flight request. We mock the lazy adhoc-query trigger so the
// action stays pending (i.e. the query is still "running") when cancelQuery is
// called, then assert that cancelQuery aborts it.
const mockAbort = jest.fn();
const mockTrigger = jest.fn(() => {
  // A never-resolving thenable: models an in-flight request that has not
  // returned yet. `abort` is what cancelQuery is expected to call.
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

    // Start the query. The mocked action never resolves, so the request is
    // still in flight (abortRef is set) when we cancel below.
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
