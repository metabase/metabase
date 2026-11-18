import {
  createMockQueryBuilderState,
  createMockQueryBuilderUIControlsState,
} from "__support__/state";
import { createMockCard, createMockDataset } from "metabase-types/api/mocks";

import { CANCEL_QUERY, QUERY_COMPLETED, QUERY_ERRORED } from "./actions";
import { queryBuilderReducer } from "./reducer";

describe("queryBuilderReducer", () => {
  it.each([
    {
      outcome: "cancellation",
      action: { type: CANCEL_QUERY },
      shouldScroll: false,
    },
    {
      outcome: "request failure",
      action: { type: QUERY_ERRORED, payload: { error: "Request failed" } },
      shouldScroll: false,
    },
    ...[false, true].map((hasError) => ({
      outcome: hasError ? "query failure" : "success",
      action: {
        type: QUERY_COMPLETED,
        payload: {
          card: createMockCard(),
          queryResults: [
            createMockDataset({
              error: hasError ? "Invalid query" : undefined,
            }),
          ],
        },
      },
      shouldScroll: !hasError,
    })),
  ])(
    "only keeps the pending column scroll on success: $outcome",
    ({ action, shouldScroll }) => {
      const state = createMockQueryBuilderState({
        uiControls: createMockQueryBuilderUIControlsState({
          isRunning: true,
          scrollToLastColumn: true,
        }),
      });

      const nextState = queryBuilderReducer(state, action);

      expect(nextState.uiControls.scrollToLastColumn).toBe(shouldScroll);
    },
  );
});
