import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { createMockMetadataFromState } from "__support__/metadata";
import { setupGoalValuesEndpoint } from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { dynamicGoalApi } from "metabase/api";
import { registerVisualizations } from "metabase/visualizations/register";
import type { OnOpenChartSettings } from "metabase/visualizations/types";
import { loadVisualizationComponents } from "metabase/viz-core";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type {
  Dataset,
  ReferencedEntitiesResults,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockFailedReferencedEntitiesResults,
  createMockReferencedEntitiesResults,
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

const GOAL_SETTINGS: VisualizationSettings = {
  "graph.dimensions": ["month"],
  "graph.metrics": ["count"],
  "graph.show_goal": true,
  "graph.goal_value": { type: "card", id: 9, column: "goal" },
};

const ANSWERED = createMockReferencedEntitiesResults({
  column: "goal",
  value: 250,
});

const FAILED = createMockFailedReferencedEntitiesResults();

const GOAL_WARNING = "Couldn't get the goal value. Click to open settings.";
const TRUNCATION_WARNING = "Data truncated to 2 rows.";
const NEGATIVE_COLOR = "var(--mantine-color-feedback-negative-text)";

type ResultOpts = {
  rowsTruncated?: number;
};

type SetupOpts = ResultOpts & {
  canOpenChartSettings?: boolean;
  goalValues: ReferencedEntitiesResults;
};

async function setup({
  canOpenChartSettings = true,
  goalValues,
  rowsTruncated,
}: SetupOpts) {
  setupGoalValuesEndpoint(goalValues);

  const onOpenChartSettings = jest.fn<void, Parameters<OnOpenChartSettings>>();
  const question = new Question(
    {
      dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
      display: "line",
      visualization_settings: GOAL_SETTINGS,
    },
    metadata,
  );

  function getVisualization(result: Dataset) {
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
  const { rerender, store } = renderWithProviders(
    getVisualization(createResult({ rowsTruncated })),
  );
  await waitForChartSize();

  async function rerenderWithResult(result: Dataset) {
    rerender(getVisualization(result));
    await waitForChartSize();
  }

  function refetchGoalValues() {
    store.dispatch(dynamicGoalApi.util.invalidateTags(["dynamic-goal-values"]));
  }

  return { onOpenChartSettings, refetchGoalValues, rerenderWithResult };
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
    const { onOpenChartSettings } = await setup({ goalValues: FAILED });

    const warning = await findWarningsButton();
    expect(warning).toHaveAccessibleDescription(GOAL_WARNING);
    expect(getWarningIcon()).toHaveStyle({ color: NEGATIVE_COLOR });

    await userEvent.click(warning);

    expect(onOpenChartSettings).toHaveBeenCalledTimes(1);
    expect(onOpenChartSettings).toHaveBeenCalledWith({
      initialChartSettings: { section: "Display" },
    });
  });

  it("combines the goal warning with other warnings in one red icon", async () => {
    await setup({ goalValues: FAILED, rowsTruncated: 2 });

    const warning = await findWarningsButton();
    expect(screen.getAllByLabelText("warning icon")).toHaveLength(1);
    expect(getWarningIcon()).toHaveStyle({ color: NEGATIVE_COLOR });

    await userEvent.hover(warning);

    const tooltip = await screen.findByRole("tooltip");
    expect(within(tooltip).getByText(GOAL_WARNING)).toBeInTheDocument();
    expect(within(tooltip).getByText(TRUNCATION_WARNING)).toBeInTheDocument();
  });

  it("shows other warnings in a gray icon that opens nothing when the goal value resolves", async () => {
    await setup({ goalValues: ANSWERED, rowsTruncated: 2 });

    expect(await screen.findByText("Jan")).toBeInTheDocument();
    expect(queryWarningsButton()).not.toBeInTheDocument();
    expect(getWarningIcon()).not.toHaveStyle({ color: NEGATIVE_COLOR });

    await userEvent.hover(getWarningIcon());

    const tooltip = await screen.findByRole("tooltip");
    expect(within(tooltip).getByText(TRUNCATION_WARNING)).toBeInTheDocument();
    expect(within(tooltip).queryByText(GOAL_WARNING)).not.toBeInTheDocument();
  });

  it("hides the goal warning once a refetch resolves the goal value", async () => {
    const { refetchGoalValues } = await setup({ goalValues: FAILED });
    expect(await findWarningsButton()).toBeInTheDocument();

    fetchMock.modifyRoute("dynamic-goal-values", { response: ANSWERED });
    refetchGoalValues();

    await waitFor(() => expect(queryWarningIcon()).not.toBeInTheDocument());
    expect(screen.getByText("Jan")).toBeInTheDocument();
  });

  it("hides the goal warning when the query fails and the chart goes away", async () => {
    const { rerenderWithResult } = await setup({ goalValues: FAILED });
    expect(await findWarningsButton()).toBeInTheDocument();

    await rerenderWithResult(createMockDataset({ error: "Query failed" }));

    expect(screen.queryByText("Jan")).not.toBeInTheDocument();
    expect(queryWarningIcon()).not.toBeInTheDocument();
  });

  it("shows no warning when the goal value resolves", async () => {
    await setup({ goalValues: ANSWERED });

    expect(await screen.findByText("Jan")).toBeInTheDocument();
    expect(queryWarningIcon()).not.toBeInTheDocument();
  });

  it("shows no goal warning when the chart settings cannot be opened", async () => {
    await setup({ canOpenChartSettings: false, goalValues: FAILED });

    expect(await screen.findByText("Jan")).toBeInTheDocument();
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

function createResult({ rowsTruncated }: ResultOpts = {}) {
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

// ExplicitSize sets the chart dimensions after mounting
async function waitForChartSize() {
  await act(async () => {
    jest.advanceTimersByTime(0);
  });
}

function findWarningsButton() {
  return screen.findByRole("button", { name: "Warnings" });
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
