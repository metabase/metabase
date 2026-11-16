import fetchMock from "fetch-mock";

import {
  DYNAMIC_GOAL_CARTESIAN_DISPLAYS,
  PATHS_PER_GOAL_LINE,
  queryAllEChartsGoalLines,
  queryEChartsGoalLine,
} from "__support__/dynamic-goals";
import { setupGoalValuesEndpoint } from "__support__/server-mocks";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { defer } from "metabase/utils/promise";
import { checkNotNull } from "metabase/utils/types";
import Visualization from "metabase/visualizations/components/Visualization";
import { registerVisualizations } from "metabase/visualizations/register";
import type { OnUpdateGoalWarning } from "metabase/visualizations/types";
import { loadVisualizationComponents } from "metabase/viz-core";
import type {
  DatasetColumn,
  RawSeries,
  ReferencedEntitiesResults,
  RowValues,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
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

const NORMALIZED_STACK_SETTINGS: VisualizationSettings = {
  "graph.metrics": ["count", "sum"],
  "stackable.stack_type": "normalized",
};

const GOAL_LABEL = "Target";

const ANSWERED = createMockReferencedEntitiesResults({
  column: "goal",
  value: 250,
});

const FAILED = createMockFailedReferencedEntitiesResults();

type SetupOpts = {
  cols?: DatasetColumn[];
  display: VisualizationDisplay;
  goalValues: Parameters<typeof setupGoalValuesEndpoint>[0];
  rows?: RowValues[];
  settings?: VisualizationSettings;
  onUpdateGoalWarning?: OnUpdateGoalWarning;
};

async function setup({
  cols,
  display,
  goalValues,
  rows,
  settings,
  onUpdateGoalWarning,
}: SetupOpts) {
  setupGoalValuesEndpoint(goalValues);
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

    it("draws the goal line at the fetched value", async () => {
      await setup({ display, goalValues: ANSWERED });

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
      await setup({ display, goalValues: () => goalValues.promise });

      expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
      expect(queryEChartsGoalLine()).not.toBeInTheDocument();

      goalValues.resolve(ANSWERED);

      await waitForGoalLine();
      expect(screen.getByText("250")).toBeInTheDocument();
      expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
    });

    it("draws no goal line when fetching the reference fails", async () => {
      await setup({
        display,
        goalValues: () => new Response(null, { status: 500 }),
      });

      expect(await screen.findByText("Jan")).toBeInTheDocument();
      expect(queryEChartsGoalLine()).not.toBeInTheDocument();
      expect(screen.queryByText(GOAL_LABEL)).not.toBeInTheDocument();
    });

    it("draws no goal line when the reference is reported as failed", async () => {
      await setup({ display, goalValues: FAILED });

      expect(await screen.findByText("Jan")).toBeInTheDocument();
      expect(queryEChartsGoalLine()).not.toBeInTheDocument();
      expect(screen.queryByText(GOAL_LABEL)).not.toBeInTheDocument();
      expect(getGoalValuesCalls()).toHaveLength(1);
    });

    it("draws no goal line when the goal is withheld", async () => {
      await setup({
        display,
        goalValues: createMockFailedReferencedEntitiesResults({
          error_type: "withheld",
        }),
      });

      expect(await screen.findByText("Jan")).toBeInTheDocument();
      expect(queryEChartsGoalLine()).not.toBeInTheDocument();
      expect(screen.queryByText(GOAL_LABEL)).not.toBeInTheDocument();
      expect(getGoalValuesCalls()).toHaveLength(1);
    });

    it("reports a goal warning when the reference cannot be resolved", async () => {
      const onUpdateGoalWarning = jest.fn<void, [boolean]>();

      await setup({ display, goalValues: FAILED, onUpdateGoalWarning });

      await waitFor(() =>
        expect(onUpdateGoalWarning).toHaveBeenLastCalledWith(true),
      );
    });

    it("reports no goal warning when the reference resolves", async () => {
      const onUpdateGoalWarning = jest.fn<void, [boolean]>();

      await setup({ display, goalValues: ANSWERED, onUpdateGoalWarning });

      await waitForGoalLine();
      expect(onUpdateGoalWarning).toHaveBeenLastCalledWith(false);
      expect(onUpdateGoalWarning).not.toHaveBeenCalledWith(true);
    });
  },
);

describe("line chart with a fetched goal that isn't positive", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("draws the goal line at a fetched goal of 0", async () => {
    await setup({
      display: "line",
      goalValues: createMockReferencedEntitiesResults({
        column: "goal",
        value: 0,
      }),
    });

    await waitFor(() => expect(queryEChartsGoalLine()).toBeInTheDocument());
  });

  it("draws the goal line at a negative fetched goal, stretching the y-axis down to it", async () => {
    await setup({
      display: "line",
      goalValues: createMockReferencedEntitiesResults({
        column: "goal",
        value: -250,
      }),
    });

    await waitForGoalLine();
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
      goalValues: ANSWERED,
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
      goalValues: ANSWERED,
      rows: MULTI_SERIES_ROWS,
      settings: {
        "graph.metrics": ["count", "sum"],
        series_settings: { sum: { axis: "right" } },
      },
    });

    await waitForGoalLine();
    expect(queryAllEChartsGoalLines()).toHaveLength(PATHS_PER_GOAL_LINE);
    expect(screen.getByText("250")).toBeInTheDocument();
  });
});

describe("normalized stacked chart with a dynamic goal", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("reads the fetched goal as a percentage of a stacked bar", async () => {
    await setup({
      cols: MULTI_SERIES_COLS,
      display: "bar",
      goalValues: createMockReferencedEntitiesResults({
        column: "goal",
        value: 50,
      }),
      rows: MULTI_SERIES_ROWS,
      settings: NORMALIZED_STACK_SETTINGS,
    });

    await waitForGoalLine();
    expectGoalLineHalfwayUpPercentAxis();
  });

  it("reads the fetched goal as a percentage of a stacked area", async () => {
    await setup({
      cols: MULTI_SERIES_COLS,
      display: "area",
      goalValues: createMockReferencedEntitiesResults({
        column: "goal",
        value: 50,
      }),
      rows: MULTI_SERIES_ROWS,
      settings: NORMALIZED_STACK_SETTINGS,
    });

    await waitForGoalLine();
    expectGoalLineHalfwayUpPercentAxis();
  });
});

describe("line chart whose goal column no longer exists", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders the chart without the goal and with a goal warning", async () => {
    const onUpdateGoalWarning = jest.fn<void, [boolean]>();

    await setup({
      display: "line",
      goalValues: createMockReferencedEntitiesResults({
        column: "other",
        value: 250,
      }),
      onUpdateGoalWarning,
    });

    expect(await screen.findByText("Jan")).toBeInTheDocument();
    expect(queryEChartsGoalLine()).not.toBeInTheDocument();
    expect(screen.queryByText(GOAL_LABEL)).not.toBeInTheDocument();
    expect(onUpdateGoalWarning).toHaveBeenLastCalledWith(true);
    expect(getGoalValuesCalls()).toHaveLength(1);
  });
});

async function waitForGoalLine() {
  await waitFor(() => expect(queryEChartsGoalLine()).toBeInTheDocument());
}

function getGoalValuesCalls() {
  return fetchMock.callHistory.calls("path:/api/dynamic-goal/values");
}

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
      data: createMockDatasetData({ cols, rows }),
    },
  ];
}
