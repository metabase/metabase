import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import { setupUserMetabotPermissionsEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { SERVER_ERROR_TYPES } from "metabase/utils/errors";
import { checkNotNull } from "metabase/utils/types";
import {
  createMockDatabase,
  createMockNativeCard,
} from "metabase-types/api/mocks";

import { QueryVisualization } from "./QueryVisualization";
import type { QueryVisualizationResult } from "./types";

// Witness for metabase#64293: when a native query result carries a
// `missing-required-parameter` error, the dirty-state overlay (the clickable
// "run query" button) must still be shown so the user can re-run after filling
// in the parameter. Before the fix the overlay was suppressed for *any* error,
// so clicking it did nothing.
function setup(errorType?: string) {
  const database = createMockDatabase();
  const card = createMockNativeCard();

  const state = createMockState({
    entities: createMockEntitiesState({
      databases: [database],
      questions: [card],
    }),
    settings: mockSettings(),
  });

  setupUserMetabotPermissionsEndpoint();

  const metadata = createMockMetadata({
    questions: [card],
    databases: [database],
  });
  const question = checkNotNull(metadata.question(card.id));

  const result = {
    error: "You'll need to pick a value for 'State' before this query can run.",
    error_type: errorType,
  } as QueryVisualizationResult;

  const runQuestionQuery = jest.fn();

  renderWithProviders(
    <QueryVisualization
      question={question}
      result={result}
      isRunnable
      isRunning={false}
      isResultDirty
      isNativeEditorOpen={false}
      runQuestionQuery={runQuestionQuery}
    />,
    { storeInitialState: state },
  );

  return { runQuestionQuery };
}

describe("QueryVisualization dirty-state overlay (metabase#64293)", () => {
  it("shows a runnable overlay for a missing-required-parameter error", async () => {
    const { runQuestionQuery } = setup(
      SERVER_ERROR_TYPES.missingRequiredParameter,
    );

    await userEvent.click(screen.getByTestId("run-button-overlay"));

    expect(runQuestionQuery).toHaveBeenCalledTimes(1);
  });
});
