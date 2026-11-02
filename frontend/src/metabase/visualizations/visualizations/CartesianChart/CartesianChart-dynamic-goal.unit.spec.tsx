import fetchMock from "fetch-mock";

import {
  DYNAMIC_GOAL_CARTESIAN_DISPLAYS,
  PATHS_PER_GOAL_LINE,
  queryAllEChartsGoalLines,
  queryEChartsGoalLine,
} from "__support__/dynamic-goals";
import { setupCardDataset } from "__support__/server-mocks";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { registerVisualizations } from "metabase/visualizations/register";
import type { OnUpdateGoalWarning } from "metabase/visualizations/types";
import { loadVisualizationComponents } from "metabase/viz-core";
import type {
  DatasetData,
  RawSeries,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockFailedReferencedEntitiesResults,
  createMockReferencedEntitiesResults,
} from "metabase-types/api/mocks";

registerVisualizations();

// Chart components are loaded on demand. Register them up front so each test
// renders in one pass and can be run on its own.
beforeAll(() =>
  loadVisualizationComponents([...DYNAMIC_GOAL_CARTESIAN_DISPLAYS]),
);

const COLS = [
  createMockColumn({ name: "month", base_type: "type/Text" }),
  createMockColumn({ name: "count", base_type: "type/Integer" }),
];

const ROWS = [
  ["Jan", 1],
  ["Feb", 2],
  ["Mar", 3],
];

const MULTI_SERIES_COLS = [
  ...COLS,
  createMockColumn({ name: "sum", base_type: "type/Integer" }),
];

const MULTI_SERIES_ROWS = [
  ["Jan", 1, 10],
  ["Feb", 2, 20],
  ["Mar", 3, 30],
];

const GOAL_LABEL = "Target";

const ANSWERED = createMockReferencedEntitiesResults({
  column: "goal",
  value: 250,
});

const FAILED = createMockFailedReferencedEntitiesResults();

type SetupOpts = {
  display: VisualizationDisplay;
  referencedEntities?: DatasetData["referenced_entities"];
  cols?: DatasetData["cols"];
  rows?: DatasetData["rows"];
  settings?: VisualizationSettings;
  onUpdateGoalWarning?: OnUpdateGoalWarning;
};

async function setup({
  display,
  referencedEntities,
  cols,
  rows,
  settings,
  onUpdateGoalWarning,
}: SetupOpts) {
  const rawSeries = createSeries({
    display,
    referenced_entities: referencedEntities,
    cols,
    rows,
    settings,
  });

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

describe.each(DYNAMIC_GOAL_CARTESIAN_DISPLAYS)(
  "%s chart dynamic goal",
  (display) => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it("draws the goal line at the value answered by the dataset", async () => {
      await setup({ display, referencedEntities: ANSWERED });

      expect(queryEChartsGoalLine()).toBeInTheDocument();
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

      await setup({ display });

      expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
      expect(queryEChartsGoalLine()).not.toBeInTheDocument();

      await waitFor(() => expect(queryEChartsGoalLine()).toBeInTheDocument());
      expect(screen.getByText("250")).toBeInTheDocument();
      expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();

      const [call] = fetchMock.callHistory.calls("path:/api/dataset");
      expect(await call.request?.json()).toMatchObject({
        referenced_entities: [{ type: "card", id: 9 }],
      });
    });

    it("draws no goal line when fetching the reference fails", async () => {
      setupCardDataset({ status: 500 });

      await setup({ display });

      expect(await screen.findByText("Jan")).toBeInTheDocument();
      expect(queryEChartsGoalLine()).not.toBeInTheDocument();
      expect(screen.queryByText(GOAL_LABEL)).not.toBeInTheDocument();
    });

    it("draws no goal line when the dataset reports the reference as failed", async () => {
      await setup({ display, referencedEntities: FAILED });

      expect(screen.getByText("Jan")).toBeInTheDocument();
      expect(queryEChartsGoalLine()).not.toBeInTheDocument();
      expect(screen.queryByText(GOAL_LABEL)).not.toBeInTheDocument();
      expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(0);
    });

    it("reports a goal warning when the reference cannot be resolved", async () => {
      const onUpdateGoalWarning = jest.fn<void, [boolean]>();

      await setup({ display, referencedEntities: FAILED, onUpdateGoalWarning });

      expect(onUpdateGoalWarning).toHaveBeenLastCalledWith(true);
    });

    it("reports no goal warning when the reference resolves", async () => {
      const onUpdateGoalWarning = jest.fn<void, [boolean]>();

      await setup({
        display,
        referencedEntities: ANSWERED,
        onUpdateGoalWarning,
      });

      expect(onUpdateGoalWarning).toHaveBeenLastCalledWith(false);
    });
  },
);

describe("line chart with multiple series and a dynamic goal", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  // each panel has its own y-axis, so unlike multiple y-axes the goal isn't tied to the first series
  it("draws the goal line in each split panel", async () => {
    await setup({
      display: "line",
      referencedEntities: ANSWERED,
      cols: MULTI_SERIES_COLS,
      rows: MULTI_SERIES_ROWS,
      settings: {
        "graph.metrics": ["count", "sum"],
        "graph.split_panels": true,
      },
    });

    expect(queryAllEChartsGoalLines()).toHaveLength(2 * PATHS_PER_GOAL_LINE);
  });

  it("draws one goal line with multiple y-axes", async () => {
    await setup({
      display: "line",
      referencedEntities: ANSWERED,
      cols: MULTI_SERIES_COLS,
      rows: MULTI_SERIES_ROWS,
      settings: {
        "graph.metrics": ["count", "sum"],
        series_settings: { sum: { axis: "right" } },
      },
    });

    expect(queryAllEChartsGoalLines()).toHaveLength(PATHS_PER_GOAL_LINE);
    expect(screen.getByText("250")).toBeInTheDocument();
  });
});

function createSeries({
  display,
  referenced_entities,
  cols = COLS,
  rows = ROWS,
  settings,
}: {
  display: VisualizationDisplay;
  referenced_entities?: DatasetData["referenced_entities"];
  cols?: DatasetData["cols"];
  rows?: DatasetData["rows"];
  settings?: VisualizationSettings;
}): RawSeries {
  return [
    {
      card: createMockCard({
        display,
        visualization_settings: {
          "graph.dimensions": ["month"],
          "graph.metrics": ["count"],
          "graph.show_goal": true,
          "graph.goal_label": GOAL_LABEL,
          "graph.goal_value": { type: "card", id: 9, column: "goal" },
          ...settings,
        },
      }),
      data: createMockDatasetData({
        cols,
        rows,
        referenced_entities,
      }),
    },
  ];
}
