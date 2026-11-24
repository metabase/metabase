import userEvent from "@testing-library/user-event";

import { createMockMetadataFromState } from "__support__/metadata";
import { setupGoalSourceResultsEndpoint } from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { act, renderWithProviders, screen, within } from "__support__/ui";
import { registerVisualizations } from "metabase/visualizations/register";
import type { OnOpenChartSettings } from "metabase/visualizations/types";
import { loadVisualizationComponents } from "metabase/viz-core";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type {
  Dataset,
  GoalForeignColumnRef,
  GoalSourceResults,
} from "metabase-types/api";
import {
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockFailedGoalSourceResult,
  createMockGoalSourceResult,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { QueryVisualization } from "./QueryVisualization";

registerVisualizations();

// Chart components are loaded on demand. Register the line chart up front so
// each test renders in one pass and can be run on its own.
beforeAll(() => loadVisualizationComponents(["line"]));

const state = createMockState({
  entities: createMockEntitiesState({
    databases: [createSampleDatabase()],
  }),
});
const metadata = createMockMetadataFromState(state);

const FAILING_GOAL: GoalForeignColumnRef = {
  type: "card",
  id: 9,
  column: "goal",
};
const RESOLVING_GOAL: GoalForeignColumnRef = {
  type: "card",
  id: 10,
  column: "goal",
};

const GOAL_SOURCE_RESULTS: GoalSourceResults = {
  card: {
    [FAILING_GOAL.id]: createMockFailedGoalSourceResult(),
    [RESOLVING_GOAL.id]: createMockGoalSourceResult({
      column: "goal",
      value: 250,
    }),
  },
};

const GOAL_WARNING = "Couldn't get the goal value. Click to open settings.";
const TRUNCATION_WARNING = "Data truncated to 2 rows.";
const NEGATIVE_COLOR = "var(--mantine-color-feedback-negative-text)";

type SetupOpts = {
  canOpenChartSettings?: boolean;
  goal: GoalForeignColumnRef;
  rowsTruncated?: number;
};

async function setup({
  canOpenChartSettings = true,
  goal,
  rowsTruncated,
}: SetupOpts) {
  setupGoalSourceResultsEndpoint(GOAL_SOURCE_RESULTS);
  const onOpenChartSettings = jest.fn<void, Parameters<OnOpenChartSettings>>();

  function getVisualization(
    result: Dataset,
    currentGoal: GoalForeignColumnRef,
  ) {
    const question = createQuestion(currentGoal);

    return (
      <QueryVisualization
        question={question}
        result={result}
        rawSeries={[{ card: question.card(), data: result.data }]}
        onOpenChartSettings={
          canOpenChartSettings ? onOpenChartSettings : undefined
        }
      />
    );
  }

  jest.useFakeTimers({ advanceTimers: true });
  const { rerender } = renderWithProviders(
    getVisualization(createResult({ rowsTruncated }), goal),
  );
  await waitForChart();

  async function rerenderWithResult(result: Dataset) {
    rerender(getVisualization(result, goal));
    await waitForChartSize();
  }

  async function rerenderWithGoal(newGoal: GoalForeignColumnRef) {
    rerender(getVisualization(createResult({ rowsTruncated }), newGoal));
    await waitForChart();
  }

  return { onOpenChartSettings, rerenderWithGoal, rerenderWithResult };
}

describe("QueryVisualization", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("should show a run button before the query is ran", async () => {
    setupWithoutResult({ isRunning: false, isResultDirty: true });

    const runButton = screen.getByTestId("run-button");
    expect(runButton).toBeVisible();
    expect(runButton).not.toHaveAttribute("aria-hidden", "true");

    expect(screen.queryByText("Doing science...")).not.toBeInTheDocument();
  });

  it("should show the loading message while the query runs", async () => {
    setupWithoutResult({ isRunning: true, isResultDirty: false });

    expect(await screen.findByText("Doing science...")).toBeInTheDocument();
    expect(screen.getByTestId("run-button")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("should not show the loading message or run button once loaded", async () => {
    setupWithoutResult({ isRunning: false, isResultDirty: false });

    expect(screen.queryByText("Doing science...")).not.toBeInTheDocument();
    expect(screen.getByTestId("run-button")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("shows a red warning that opens the display settings when the goal value cannot be resolved", async () => {
    const { onOpenChartSettings } = await setup({
      goal: FAILING_GOAL,
    });

    const warning = getWarningsButton();
    expect(warning).toHaveAccessibleDescription(GOAL_WARNING);
    expect(getWarningIcon()).toHaveStyle({ color: NEGATIVE_COLOR });

    await userEvent.click(warning);

    expect(onOpenChartSettings).toHaveBeenCalledTimes(1);
    expect(onOpenChartSettings).toHaveBeenCalledWith({
      initialChartSettings: { section: "Display" },
    });
  });

  it("combines the goal warning with other warnings in one red icon", async () => {
    await setup({
      goal: FAILING_GOAL,
      rowsTruncated: 2,
    });

    expect(screen.getAllByLabelText("warning icon")).toHaveLength(1);
    expect(getWarningIcon()).toHaveStyle({ color: NEGATIVE_COLOR });

    await userEvent.hover(getWarningsButton());

    const tooltip = await screen.findByRole("tooltip");
    expect(within(tooltip).getByText(GOAL_WARNING)).toBeInTheDocument();
    expect(within(tooltip).getByText(TRUNCATION_WARNING)).toBeInTheDocument();
  });

  it("shows other warnings in a gray icon that opens nothing when the goal value resolves", async () => {
    await setup({
      goal: RESOLVING_GOAL,
      rowsTruncated: 2,
    });

    expect(queryWarningsButton()).not.toBeInTheDocument();
    expect(getWarningIcon()).not.toHaveStyle({ color: NEGATIVE_COLOR });

    await userEvent.hover(getWarningIcon());

    const tooltip = await screen.findByRole("tooltip");
    expect(within(tooltip).getByText(TRUNCATION_WARNING)).toBeInTheDocument();
    expect(within(tooltip).queryByText(GOAL_WARNING)).not.toBeInTheDocument();
  });

  it("hides the goal warning once a goal that resolves is picked", async () => {
    const { rerenderWithGoal } = await setup({
      goal: FAILING_GOAL,
    });
    expect(getWarningsButton()).toBeInTheDocument();

    await rerenderWithGoal(RESOLVING_GOAL);

    expect(screen.getByText("Jan")).toBeInTheDocument();
    expect(queryWarningIcon()).not.toBeInTheDocument();
  });

  it("hides the goal warning when the query fails and the chart goes away", async () => {
    const { rerenderWithResult } = await setup({
      goal: FAILING_GOAL,
    });
    expect(getWarningsButton()).toBeInTheDocument();

    await rerenderWithResult(createMockDataset({ error: "Query failed" }));

    expect(screen.queryByText("Jan")).not.toBeInTheDocument();
    expect(queryWarningIcon()).not.toBeInTheDocument();
  });

  it("shows no warning when the goal value resolves", async () => {
    await setup({ goal: RESOLVING_GOAL });

    expect(screen.getByText("Jan")).toBeInTheDocument();
    expect(queryWarningIcon()).not.toBeInTheDocument();
  });

  it("shows no goal warning when the chart settings cannot be opened", async () => {
    await setup({
      goal: FAILING_GOAL,
      canOpenChartSettings: false,
    });

    expect(screen.getByText("Jan")).toBeInTheDocument();
    expect(queryWarningIcon()).not.toBeInTheDocument();
  });
});

function setupWithoutResult({
  isRunning,
  isResultDirty,
}: {
  isRunning: boolean;
  isResultDirty: boolean;
}) {
  const question = new Question(
    {
      dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
      display: "table",
      visualization_settings: {},
    },
    metadata,
  );

  renderWithProviders(
    <QueryVisualization
      question={question}
      isRunning={isRunning}
      isRunnable
      isResultDirty={isResultDirty}
    />,
    { storeInitialState: state },
  );
}

function createQuestion(goal: GoalForeignColumnRef) {
  return new Question(
    {
      dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
      display: "line",
      visualization_settings: {
        "graph.dimensions": ["month"],
        "graph.metrics": ["count"],
        "graph.show_goal": true,
        "graph.goal_value": goal,
      },
    },
    metadata,
  );
}

function createResult({ rowsTruncated }: { rowsTruncated?: number } = {}) {
  return createMockDataset({
    data: createMockDatasetData({
      cols: [
        createMockColumn({ name: "month", base_type: "type/Text" }),
        createMockColumn({ name: "count", base_type: "type/Integer" }),
      ],
      rows: [
        ["Jan", 1],
        ["Feb", 2],
      ],
      rows_truncated: rowsTruncated,
    }),
  });
}

// the chart waits for its goal source results
async function waitForChart() {
  await waitForChartSize();
  await screen.findByText("Jan");
}

// ExplicitSize sets the chart dimensions after mounting
async function waitForChartSize() {
  await act(async () => {
    jest.advanceTimersByTime(0);
  });
}

function getWarningsButton() {
  return screen.getByRole("button", { name: "Warnings" });
}

function queryWarningsButton() {
  return screen.queryByRole("button", { name: "Warnings" });
}

function getWarningIcon() {
  return screen.getByLabelText("warning icon");
}

function queryWarningIcon() {
  return screen.queryByLabelText("warning icon");
}
