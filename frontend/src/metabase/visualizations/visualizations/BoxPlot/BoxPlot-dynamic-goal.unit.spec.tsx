import fetchMock from "fetch-mock";

import { queryEChartsGoalLine } from "__support__/dynamic-goals";
import { setupGoalValuesEndpoint } from "__support__/server-mocks";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { defer } from "metabase/utils/promise";
import { checkNotNull } from "metabase/utils/types";
import Visualization from "metabase/visualizations/components/Visualization";
import { registerVisualizations } from "metabase/visualizations/register";
import type { OnUpdateGoalWarning } from "metabase/visualizations/types";
import { loadVisualizationComponents } from "metabase/viz-core";
import type { RawSeries, ReferencedEntitiesResults } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockFailedReferencedEntitiesResults,
  createMockReferencedEntitiesResults,
} from "metabase-types/api/mocks";

registerVisualizations();

// Chart components are loaded on demand. Register the box plot up front so
// each test renders in one pass and can be run on its own.
beforeAll(() => loadVisualizationComponents(["boxplot"]));

const COLS = [
  createMockColumn({ name: "category", base_type: "type/Text" }),
  createMockColumn({ name: "count", base_type: "type/Integer" }),
];

const ROWS = [
  ["Doohickey", 1],
  ["Doohickey", 2],
  ["Gadget", 2],
  ["Gadget", 3],
];

const GOAL_LABEL = "Target";

const ANSWERED = createMockReferencedEntitiesResults({
  column: "goal",
  value: 250,
});

const FAILED = createMockFailedReferencedEntitiesResults();

type SetupOpts = {
  goalValues: Parameters<typeof setupGoalValuesEndpoint>[0];
  onUpdateGoalWarning?: OnUpdateGoalWarning;
};

async function setup({ goalValues, onUpdateGoalWarning }: SetupOpts) {
  setupGoalValuesEndpoint(goalValues);

  jest.useFakeTimers();
  renderWithProviders(
    <Visualization
      rawSeries={createSeries()}
      onUpdateGoalWarning={onUpdateGoalWarning}
    />,
  );
  // ExplicitSize sets the chart dimensions after mounting
  await act(async () => {
    jest.advanceTimersByTime(0);
  });
}

describe("box plot dynamic goal", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("draws the goal line at the fetched value", async () => {
    await setup({ goalValues: ANSWERED });

    await waitForGoalLine();
    // the goal is far above every data point, so it stretches the y-axis up to it
    expect(screen.getByText("250")).toBeInTheDocument();
    expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();

    const calls = getGoalValuesCalls();
    expect(calls).toHaveLength(1);
    const body: unknown = await checkNotNull(calls[0].request).json();
    expect(body).toEqual({ sources: [{ type: "card", id: 9 }] });
  });

  it("shows a loader until the referenced value is fetched, then draws the goal", async () => {
    const goalValues = defer<ReferencedEntitiesResults>();
    await setup({ goalValues: () => goalValues.promise });

    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    expect(queryEChartsGoalLine()).not.toBeInTheDocument();

    goalValues.resolve(ANSWERED);

    await waitForGoalLine();
    expect(screen.getByText("250")).toBeInTheDocument();
    expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
  });

  it("draws no goal line when fetching the reference fails", async () => {
    await setup({ goalValues: () => new Response(null, { status: 500 }) });

    expect(await screen.findByText("Gadget")).toBeInTheDocument();
    expect(queryEChartsGoalLine()).not.toBeInTheDocument();
    expect(screen.queryByText(GOAL_LABEL)).not.toBeInTheDocument();
  });

  it("draws no goal line when the reference is reported as failed", async () => {
    await setup({ goalValues: FAILED });

    expect(await screen.findByText("Gadget")).toBeInTheDocument();
    expect(queryEChartsGoalLine()).not.toBeInTheDocument();
    expect(screen.queryByText(GOAL_LABEL)).not.toBeInTheDocument();
    expect(getGoalValuesCalls()).toHaveLength(1);
  });

  it("reports a goal warning when the reference cannot be resolved", async () => {
    const onUpdateGoalWarning = jest.fn<void, [boolean]>();

    await setup({ goalValues: FAILED, onUpdateGoalWarning });

    await waitFor(() =>
      expect(onUpdateGoalWarning).toHaveBeenLastCalledWith(true),
    );
  });

  it("reports no goal warning when the reference resolves", async () => {
    const onUpdateGoalWarning = jest.fn<void, [boolean]>();

    await setup({ goalValues: ANSWERED, onUpdateGoalWarning });

    await waitForGoalLine();
    expect(onUpdateGoalWarning).toHaveBeenLastCalledWith(false);
    expect(onUpdateGoalWarning).not.toHaveBeenCalledWith(true);
  });
});

async function waitForGoalLine() {
  await waitFor(() => expect(queryEChartsGoalLine()).toBeInTheDocument());
}

function getGoalValuesCalls() {
  return fetchMock.callHistory.calls("path:/api/dynamic-goal/values");
}

function createSeries(): RawSeries {
  return [
    {
      card: createMockCard({
        display: "boxplot",
        visualization_settings: {
          "graph.dimensions": ["category"],
          "graph.metrics": ["count"],
          "graph.show_goal": true,
          "graph.goal_label": GOAL_LABEL,
          "graph.goal_value": { type: "card", id: 9, column: "goal" },
        },
      }),
      data: createMockDatasetData({ cols: COLS, rows: ROWS }),
    },
  ];
}
