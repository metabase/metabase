import { act, renderWithProviders, screen, within } from "__support__/ui";
import { PLUGIN_SELECTORS } from "metabase/plugins";
import {
  QueryVisualization,
  VisualizationRunningState,
} from "metabase/querying/components/QueryVisualization";
import type { QueryVisualizationResult } from "metabase/querying/components/QueryVisualization/types";
import { SAMPLE_METADATA } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import { createMockDataset } from "metabase-types/api/mocks";
import { ORDERS_ID, SAMPLE_DB_ID } from "metabase-types/api/mocks/presets";

// Isolate the VisualizationResult empty-state branch from the full visualization
// renderer, which needs the visualization registry we don't set up here.
jest.mock("metabase/visualizations/components/Visualization", () => ({
  __esModule: true,
  default: () => <div data-testid="visualization-stub" />,
}));

type SetupOpts = {
  customMessage?: (isSlow?: boolean) => string;
};

function setup({ customMessage }: SetupOpts = {}) {
  if (customMessage) {
    jest
      .spyOn(PLUGIN_SELECTORS, "getLoadingMessageFactory")
      .mockImplementation(() => customMessage);
  }

  renderWithProviders(<VisualizationRunningState />);
}

describe("VisualizationRunningState", () => {
  it("should render the different loading messages after a while", async () => {
    jest.useFakeTimers();

    setup();
    expect(await screen.findByText("Doing science...")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(
      await screen.findByText("Waiting for results..."),
    ).toBeInTheDocument();
  });

  it("should only render the custom loading message when it was customized", async () => {
    const customMessage = (isSlow?: boolean) =>
      isSlow ? `Custom message (slow)...` : `Custom message...`;

    setup({ customMessage });
    expect(await screen.findByText("Custom message...")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(
      await screen.findByText("Custom message (slow)..."),
    ).toBeInTheDocument();
  });
});

// keyboard-shortcut hint text that only renders inside the run-button overlay
// while it is shown (see `!hidden && <Text>` in QueryVisualization)
const OVERLAY_SHORTCUT_HINT = /⌘ \+ return|Ctrl \+ enter/;

type OverlaySetupOpts = {
  result?: QueryVisualizationResult | null;
};

function setupOverlay({ result }: OverlaySetupOpts = {}) {
  const question = Question.create({
    DEPRECATED_RAW_MBQL_databaseId: SAMPLE_DB_ID,
    DEPRECATED_RAW_MBQL_tableId: ORDERS_ID,
    metadata: SAMPLE_METADATA,
  });

  renderWithProviders(
    <QueryVisualization
      question={question}
      result={result}
      isRunnable
      isResultDirty
      isRunning={false}
      isNativeEditorOpen={false}
    />,
  );
}

describe("QueryVisualization run-button overlay (metabase#12586)", () => {
  it("shows the run-button overlay when the result is dirty and there is no error", () => {
    setupOverlay({ result: null });

    const overlay = screen.getByTestId("run-button-overlay");
    expect(
      within(overlay).getByText(OVERLAY_SHORTCUT_HINT),
    ).toBeInTheDocument();
  });

  it("hides the run-button overlay when the query run errored", () => {
    setupOverlay({
      // a minimal result carrying only the error the overlay logic reads
      result: { error: { status: 500 } } as QueryVisualizationResult,
    });

    // the error itself is still surfaced to the user
    expect(
      screen.getByText("We're experiencing server issues"),
    ).toBeInTheDocument();

    // ...but the dirty-state run-button overlay is hidden
    const overlay = screen.getByTestId("run-button-overlay");
    expect(
      within(overlay).queryByText(OVERLAY_SHORTCUT_HINT),
    ).not.toBeInTheDocument();
  });
});

// Witness for metabase#41464: a query that finishes with zero rows shows the
// "No results" empty state, but that state must NOT collide with the loading
// state. While a fresh run is in flight (`isRunning`), the previous result may
// still be present with zero rows — the "No results" message must be suppressed
// so it does not flash over the loading indicator. The guard lives in
// VisualizationResult: `noResults && !isRunning`.
function setupNoResults({ isRunning }: { isRunning: boolean }) {
  const question = Question.create({
    DEPRECATED_RAW_MBQL_databaseId: SAMPLE_DB_ID,
    DEPRECATED_RAW_MBQL_tableId: ORDERS_ID,
    metadata: SAMPLE_METADATA,
  });

  // a successful run that returned zero rows
  const result = createMockDataset() as QueryVisualizationResult;

  renderWithProviders(
    <QueryVisualization
      question={question}
      result={result}
      isRunnable
      isResultDirty={false}
      isRunning={isRunning}
      isNativeEditorOpen={false}
    />,
  );
}

describe("QueryVisualization no-results vs running state (metabase#41464)", () => {
  it("shows the 'No results' message when a finished query returned zero rows", () => {
    setupNoResults({ isRunning: false });

    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("does not show 'No results' while the query is still running", () => {
    setupNoResults({ isRunning: true });

    expect(screen.queryByText("No results")).not.toBeInTheDocument();
  });
});
