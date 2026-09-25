import fetchMock from "fetch-mock";

import { setupCardDataset } from "__support__/server-mocks";
import { act, renderWithProviders, screen } from "__support__/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { registerVisualizations } from "metabase/visualizations/register";
import { loadVisualizationComponents } from "metabase/viz-core";
import type { DatasetData, RawSeries } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
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
const GOAL_ERROR = "Couldn't load the value this chart's goal depends on.";

const ANSWERED = createMockReferencedEntitiesResults({
  column: "goal",
  value: 250,
});

const FAILED = createMockFailedReferencedEntitiesResults();

async function setup(rawSeries: RawSeries) {
  jest.useFakeTimers();
  renderWithProviders(<Visualization rawSeries={rawSeries} />);
  // ExplicitSize sets the chart dimensions after mounting
  await act(async () => {
    jest.advanceTimersByTime(0);
  });
}

describe("box plot dynamic goal", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("draws the goal line at the value answered by the dataset", async () => {
    await setup(createSeries(ANSWERED));

    expect(screen.getByText(GOAL_LABEL)).toBeInTheDocument();
    // the goal is far above every data point, so it stretches the y-axis up to it
    expect(screen.getByText("250")).toBeInTheDocument();
    expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
    expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(0);
  });

  it("shows a loader until an unanswered reference is fetched, then draws the goal", async () => {
    fetchMock.post(
      "path:/api/dataset",
      createMockDataset({
        data: createMockDatasetData({ referenced_entities: ANSWERED }),
      }),
      {
        delay: 100, // long enough to see the loader
      },
    );

    await setup(createSeries());

    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    expect(screen.queryByText(GOAL_LABEL)).not.toBeInTheDocument();

    expect(await screen.findByText(GOAL_LABEL)).toBeInTheDocument();
    expect(screen.getByText("250")).toBeInTheDocument();
    expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();

    const [call] = fetchMock.callHistory.calls("path:/api/dataset");
    expect(await call.request?.json()).toMatchObject({
      referenced_entities: [{ type: "card", id: 9 }],
    });
  });

  it("shows the failed message when fetching the reference fails", async () => {
    setupCardDataset({ status: 500 });

    await setup(createSeries());

    expect(await screen.findByText(GOAL_ERROR)).toBeInTheDocument();
    expect(screen.queryByText(GOAL_LABEL)).not.toBeInTheDocument();
  });

  it("refuses to render when the dataset reports the reference as failed", async () => {
    await setup(createSeries(FAILED));

    expect(screen.getByText(GOAL_ERROR)).toBeInTheDocument();
    expect(screen.queryByText(GOAL_LABEL)).not.toBeInTheDocument();
    expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(0);
  });
});

function createSeries(
  referenced_entities?: DatasetData["referenced_entities"],
): RawSeries {
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
        referenced_entities,
      }),
    },
  ];
}
