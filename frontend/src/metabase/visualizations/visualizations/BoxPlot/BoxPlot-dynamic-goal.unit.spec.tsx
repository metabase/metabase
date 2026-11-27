import fetchMock from "fetch-mock";

import { queryEChartsGoalLine } from "__support__/dynamic-goals";
import { setupGoalSourceResultsEndpoint } from "__support__/server-mocks";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { registerVisualizations } from "metabase/visualizations/register";
import type { OnUpdateGoalWarning } from "metabase/visualizations/types";
import { loadVisualizationComponents } from "metabase/viz-core";
import type { GoalSourceResults, RawSeries } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockFailedGoalSourceResults,
  createMockGoalSourceResults,
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

const ANSWERED = createMockGoalSourceResults({ column: "goal", value: 250 });

const FAILED = createMockFailedGoalSourceResults();

type SetupOpts = {
  goalSourceResults?: GoalSourceResults | number;
  onUpdateGoalWarning?: OnUpdateGoalWarning;
};

async function setup({
  goalSourceResults = ANSWERED,
  onUpdateGoalWarning,
}: SetupOpts = {}) {
  setupGoalSourceResultsEndpoint(goalSourceResults);
  const rawSeries = createSeries();

  jest.useFakeTimers();
  renderWithProviders(
    <Visualization
      rawSeries={rawSeries}
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

  it("shows a loader until the goal source is fetched, then draws the goal line at its value", async () => {
    await setup();

    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    expect(queryEChartsGoalLine()).not.toBeInTheDocument();

    await waitFor(() => expect(queryEChartsGoalLine()).toBeInTheDocument());
    // the goal is far above every data point, so it stretches the y-axis up to it
    expect(screen.getByText("250")).toBeInTheDocument();
    expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
    expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(0);
  });

  it("draws no goal line when fetching the goal source fails", async () => {
    await setup({ goalSourceResults: 500 });

    expect(await screen.findByText("Gadget")).toBeInTheDocument();
    expect(queryEChartsGoalLine()).not.toBeInTheDocument();
    expect(screen.queryByText(GOAL_LABEL)).not.toBeInTheDocument();
  });

  it("draws no goal line when the goal source failed", async () => {
    await setup({ goalSourceResults: FAILED });

    expect(await screen.findByText("Gadget")).toBeInTheDocument();
    expect(queryEChartsGoalLine()).not.toBeInTheDocument();
    expect(screen.queryByText(GOAL_LABEL)).not.toBeInTheDocument();
  });

  it("reports a goal warning when the reference cannot be resolved", async () => {
    const onUpdateGoalWarning = jest.fn<void, [boolean]>();

    await setup({ goalSourceResults: FAILED, onUpdateGoalWarning });

    await waitFor(() =>
      expect(onUpdateGoalWarning).toHaveBeenLastCalledWith(true),
    );
  });

  it("reports no goal warning when the reference resolves", async () => {
    const onUpdateGoalWarning = jest.fn<void, [boolean]>();

    await setup({ goalSourceResults: ANSWERED, onUpdateGoalWarning });

    await waitFor(() => expect(queryEChartsGoalLine()).toBeInTheDocument());
    expect(onUpdateGoalWarning).toHaveBeenLastCalledWith(false);
  });
});

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
      data: createMockDatasetData({
        cols: COLS,
        rows: ROWS,
      }),
    },
  ];
}
