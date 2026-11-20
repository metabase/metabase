import fetchMock from "fetch-mock";

import {
  DYNAMIC_GOAL_CARTESIAN_DISPLAYS,
  PATHS_PER_GOAL_LINE,
  queryAllEChartsGoalLines,
  queryEChartsGoalLine,
} from "__support__/dynamic-goals";
import { setupGoalSourceResultsEndpoint } from "__support__/server-mocks";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { defer } from "metabase/utils/promise";
import Visualization from "metabase/visualizations/components/Visualization";
import { registerVisualizations } from "metabase/visualizations/register";
import type { OnUpdateGoalWarning } from "metabase/visualizations/types";
import { loadVisualizationComponents } from "metabase/viz-core";
import type {
  DatasetColumn,
  GoalSourceResults,
  RawSeries,
  RowValues,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockFailedGoalSourceResults,
  createMockGoalSourceResults,
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

const NORMALIZED_STACK_SETTINGS: VisualizationSettings = {
  "graph.metrics": ["count", "sum"],
  "stackable.stack_type": "normalized",
};

const GOAL_LABEL = "Target";

const ANSWERED = createMockGoalSourceResults({ column: "goal", value: 250 });

const FAILED = createMockFailedGoalSourceResults();

type SetupOpts = {
  cols?: DatasetColumn[];
  display: VisualizationDisplay;
  goalSourceResults?:
    | GoalSourceResults
    | number
    | (() => Promise<GoalSourceResults>);
  rows?: RowValues[];
  settings?: VisualizationSettings;
  onUpdateGoalWarning?: OnUpdateGoalWarning;
};

async function setup({
  cols,
  display,
  goalSourceResults = ANSWERED,
  rows,
  settings,
  onUpdateGoalWarning,
}: SetupOpts) {
  setupGoalSourceResultsEndpoint(goalSourceResults);
  const rawSeries = createSeries({ cols, display, rows, settings });

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

    it("shows a loader until the goal source is fetched, then draws the goal line at its value", async () => {
      const response = defer<GoalSourceResults>();
      await setup({ display, goalSourceResults: () => response.promise });

      expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
      expect(queryEChartsGoalLine()).not.toBeInTheDocument();

      response.resolve(ANSWERED);

      await waitFor(() => expect(queryEChartsGoalLine()).toBeInTheDocument());
      // the goal is far above every data point, so it stretches the y-axis up to it
      expect(screen.getByText("250")).toBeInTheDocument();
      expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
      expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(0);
    });

    it("draws no goal line when fetching the goal source fails", async () => {
      await setup({ display, goalSourceResults: 500 });

      expect(await screen.findByText("Jan")).toBeInTheDocument();
      expect(queryEChartsGoalLine()).not.toBeInTheDocument();
      expect(screen.queryByText(GOAL_LABEL)).not.toBeInTheDocument();
    });

    it("draws no goal line when the goal source failed", async () => {
      await setup({ display, goalSourceResults: FAILED });

      expect(await screen.findByText("Jan")).toBeInTheDocument();
      expect(queryEChartsGoalLine()).not.toBeInTheDocument();
      expect(screen.queryByText(GOAL_LABEL)).not.toBeInTheDocument();
    });

    it("draws no goal line when the goal is withheld", async () => {
      await setup({
        display,
        goalSourceResults: createMockFailedGoalSourceResults({
          error_type: "withheld",
        }),
      });

      expect(await screen.findByText("Jan")).toBeInTheDocument();
      expect(queryEChartsGoalLine()).not.toBeInTheDocument();
      expect(screen.queryByText(GOAL_LABEL)).not.toBeInTheDocument();
    });

    it("reports a goal warning when the reference cannot be resolved", async () => {
      const onUpdateGoalWarning = jest.fn<void, [boolean]>();

      await setup({ display, goalSourceResults: FAILED, onUpdateGoalWarning });

      await waitFor(() =>
        expect(onUpdateGoalWarning).toHaveBeenLastCalledWith(true),
      );
    });

    it("reports no goal warning when the reference resolves", async () => {
      const onUpdateGoalWarning = jest.fn<void, [boolean]>();

      await setup({ display, onUpdateGoalWarning });

      await waitFor(() => expect(queryEChartsGoalLine()).toBeInTheDocument());
      expect(onUpdateGoalWarning).toHaveBeenLastCalledWith(false);
    });
  },
);

describe("line chart with an answered goal that isn't positive", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("draws the goal line at an answered goal of 0", async () => {
    await setup({
      display: "line",
      goalSourceResults: createMockGoalSourceResults({
        column: "goal",
        value: 0,
      }),
    });

    await waitFor(() => expect(queryEChartsGoalLine()).toBeInTheDocument());
  });

  it("draws the goal line at a negative answered goal, stretching the y-axis down to it", async () => {
    await setup({
      display: "line",
      goalSourceResults: createMockGoalSourceResults({
        column: "goal",
        value: -250,
      }),
    });

    await waitFor(() => expect(queryEChartsGoalLine()).toBeInTheDocument());
    expect(screen.getByText("-250")).toBeInTheDocument();
  });
});

describe("line chart with multiple series and a dynamic goal", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("draws the goal line in each split panel", async () => {
    await setup({
      cols: MULTI_SERIES_COLS,
      display: "line",
      rows: MULTI_SERIES_ROWS,
      settings: {
        "graph.metrics": ["count", "sum"],
        "graph.split_panels": true,
      },
    });

    await waitFor(() =>
      expect(queryAllEChartsGoalLines()).toHaveLength(2 * PATHS_PER_GOAL_LINE),
    );
  });

  it("draws one goal line with multiple y-axes", async () => {
    await setup({
      cols: MULTI_SERIES_COLS,
      display: "line",
      rows: MULTI_SERIES_ROWS,
      settings: {
        "graph.metrics": ["count", "sum"],
        series_settings: { sum: { axis: "right" } },
      },
    });

    await waitFor(() =>
      expect(queryAllEChartsGoalLines()).toHaveLength(PATHS_PER_GOAL_LINE),
    );
    expect(screen.getByText("250")).toBeInTheDocument();
  });
});

describe("normalized stacked chart with a dynamic goal", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("reads the answered goal as a percentage of a stacked bar", async () => {
    await setup({
      cols: MULTI_SERIES_COLS,
      display: "bar",
      goalSourceResults: createMockGoalSourceResults({
        column: "goal",
        value: 50,
      }),
      rows: MULTI_SERIES_ROWS,
      settings: NORMALIZED_STACK_SETTINGS,
    });

    await waitFor(() => expect(queryEChartsGoalLine()).toBeInTheDocument());
    expectGoalLineHalfwayUpPercentAxis();
  });

  it("reads the answered goal as a percentage of a stacked area", async () => {
    await setup({
      cols: MULTI_SERIES_COLS,
      display: "area",
      goalSourceResults: createMockGoalSourceResults({
        column: "goal",
        value: 50,
      }),
      rows: MULTI_SERIES_ROWS,
      settings: NORMALIZED_STACK_SETTINGS,
    });

    await waitFor(() => expect(queryEChartsGoalLine()).toBeInTheDocument());
    expectGoalLineHalfwayUpPercentAxis();
  });
});

function expectGoalLineHalfwayUpPercentAxis() {
  // the axis stays within 0-100%, instead of stretching to a 50x stack
  expect(screen.queryByText("5000%")).not.toBeInTheDocument();

  const midpoint = (getTickY("0%") + getTickY("100%")) / 2;
  expect(getGoalLineY()).toBeCloseTo(midpoint, 0);
}

function getTickY(label: string) {
  const transform = screen.getByText(label).getAttribute("transform") ?? "";
  const match = transform.match(/^translate\([\d.]+ ([\d.]+)\)$/);

  if (match == null) {
    throw new Error(`no y position in the ${label} tick transform`);
  }

  return Number(match[1]);
}

function getGoalLineY() {
  const goalLine = Array.from(queryAllEChartsGoalLines()).at(-1);
  const match = goalLine?.getAttribute("d")?.match(/^M[\d.]+ ([\d.]+)L/);

  if (match == null) {
    throw new Error("no goal line");
  }

  return Number(match[1]);
}

function createSeries({
  cols = COLS,
  display,
  rows = ROWS,
  settings,
}: {
  cols?: DatasetColumn[];
  display: VisualizationDisplay;
  rows?: RowValues[];
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
      }),
    },
  ];
}
