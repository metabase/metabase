import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupGoalValuesEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { defer } from "metabase/utils/promise";
import { checkNotNull } from "metabase/utils/types";
import Visualization from "metabase/visualizations/components/Visualization";
import { registerVisualizations } from "metabase/visualizations/register";
import { loadVisualizationComponents } from "metabase/viz-core";
import type {
  DatasetColumn,
  RawSeries,
  ReferencedEntitiesResults,
  RowValues,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockFailedReferencedEntitiesResults,
  createMockReferencedEntitiesResults,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

registerVisualizations();

// Chart components are loaded on demand. Register the progress chart up front so
// each test renders in one pass and can be run on its own.
beforeAll(() => loadVisualizationComponents(["progress"]));

const COLS = [createMockColumn({ name: "count", base_type: "type/Integer" })];
const ROWS = [[50]];
const SELF_GOAL_COLS = [
  ...COLS,
  createMockColumn({ name: "goal", base_type: "type/Integer" }),
];
const SELF_GOAL_SETTINGS: VisualizationSettings = {
  "progress.value": "count",
  "progress.goal": "goal",
};
const SETTINGS: VisualizationSettings = {
  "progress.goal": { type: "card", id: 9, column: "goal" },
};

type SetupOpts = {
  cols?: DatasetColumn[];
  goalValues?: Parameters<typeof setupGoalValuesEndpoint>[0];
  isQueryBuilder?: boolean;
  rows?: RowValues[];
  settings?: VisualizationSettings;
};

function setup({
  cols = COLS,
  goalValues = createMockFailedReferencedEntitiesResults({ error: "boom" }),
  isQueryBuilder = false,
  rows = ROWS,
  settings = SETTINGS,
}: SetupOpts = {}) {
  setupGoalValuesEndpoint(goalValues);

  const series: RawSeries = [
    createMockSingleSeries(
      createMockCard({ display: "progress", visualization_settings: settings }),
      {
        data: createMockDatasetData({ cols, rows }),
      },
    ),
  ];

  const onOpenChartSettings = jest.fn();

  renderWithProviders(
    <Visualization
      isQueryBuilder={isQueryBuilder}
      rawSeries={series}
      onOpenChartSettings={onOpenChartSettings}
    />,
  );

  return { onOpenChartSettings };
}

describe("progress chart dynamic goal", () => {
  it("measures progress against a static goal value", async () => {
    setup({ settings: { "progress.goal": 250 } });

    expect(await screen.findByText("Goal 250")).toBeInTheDocument();
  });

  it("measures progress against the value fetched for the referenced entity", async () => {
    setup({ goalValues: createMockReferencedEntitiesResults({ value: 40 }) });

    expect(await screen.findByText("Goal 40")).toBeInTheDocument();
    expect(screen.getByText("Goal exceeded")).toBeInTheDocument();
    const calls = getGoalValuesCalls();
    expect(calls).toHaveLength(1);
    const body: unknown = await checkNotNull(calls[0].request).json();
    expect(body).toEqual({ sources: [{ type: "card", id: 9 }] });
  });

  it("formats the goal with this chart's column settings", async () => {
    setup({
      settings: {
        ...SETTINGS,
        column_settings: { '["name","count"]': { prefix: "$" } },
      },
      goalValues: createMockReferencedEntitiesResults({ value: 2500 }),
    });

    expect(await screen.findByText("Goal $2,500")).toBeInTheDocument();
  });

  it("shows a loader while the referenced value is being fetched", async () => {
    const goalValues = defer<ReferencedEntitiesResults>();
    setup({ goalValues: () => goalValues.promise });

    expect(await screen.findByTestId("loading-indicator")).toBeInTheDocument();
    expect(screen.queryByTestId("progress-bar")).not.toBeInTheDocument();

    goalValues.resolve(createMockReferencedEntitiesResults({ value: 250 }));

    expect(await screen.findByText("Goal 250")).toBeInTheDocument();
    expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
  });

  it("measures against a goal of 0 with a warning in the query builder when fetching the reference fails (metabase#85219)", async () => {
    setup({
      goalValues: () => new Response(null, { status: 500 }),
      isQueryBuilder: true,
    });

    expect(await screen.findByLabelText("Goal warning")).toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument();
    expect(screen.getByText("Goal 0")).toBeInTheDocument();
    expect(screen.getByText("Goal exceeded")).toBeInTheDocument();
  });

  // a failed goal also reads 0, so this tells the two apart
  it("measures against an answered goal of 0 without a warning in the query builder", async () => {
    setup({
      goalValues: createMockReferencedEntitiesResults({ value: 0 }),
      isQueryBuilder: true,
    });

    expect(await screen.findByText("Goal 0")).toBeInTheDocument();
    expect(screen.getByText("Goal exceeded")).toBeInTheDocument();
    expect(screen.queryByLabelText("Goal warning")).not.toBeInTheDocument();
  });

  it("opens the goal settings from the warning", async () => {
    const { onOpenChartSettings } = setup({
      goalValues: createMockFailedReferencedEntitiesResults({ error: "boom" }),
      isQueryBuilder: true,
    });

    await userEvent.hover(await screen.findByLabelText("Goal warning"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Couldn't get the goal value. Click to open settings.",
    );
    expect(getGoalValuesCalls()).toHaveLength(1);

    await userEvent.click(screen.getByLabelText("Goal warning"));
    expect(onOpenChartSettings).toHaveBeenCalledWith({
      initialChartSettings: { section: "Display" },
    });
  });

  it("measures progress against a goal column of the same question without a warning", async () => {
    setup({
      cols: SELF_GOAL_COLS,
      rows: [[50, 250]],
      settings: SELF_GOAL_SETTINGS,
      isQueryBuilder: true,
    });

    expect(await screen.findByText("Goal 250")).toBeInTheDocument();
    expect(screen.queryByLabelText("Goal warning")).not.toBeInTheDocument();
  });

  it("measures against a goal of 0 with a warning in the query builder when the goal column's cell is null (metabase#85219)", async () => {
    setup({
      cols: SELF_GOAL_COLS,
      rows: [[50, null]],
      settings: SELF_GOAL_SETTINGS,
      isQueryBuilder: true,
    });

    expect(await screen.findByLabelText("Goal warning")).toBeInTheDocument();
    expect(screen.getByText("Goal 0")).toBeInTheDocument();
  });

  it("measures against a goal of 0 with a warning in the query builder when the goal column's question returned no rows (metabase#85219)", async () => {
    setup({
      cols: SELF_GOAL_COLS,
      rows: [],
      settings: SELF_GOAL_SETTINGS,
      isQueryBuilder: true,
    });

    expect(await screen.findByLabelText("Goal warning")).toBeInTheDocument();
    expect(screen.getByText("Goal 0")).toBeInTheDocument();
  });

  it("measures against a goal of 0 with a warning in the query builder when the goal column's cell is Infinity (metabase#85219)", async () => {
    setup({
      cols: SELF_GOAL_COLS,
      rows: [[50, "Infinity"]],
      settings: SELF_GOAL_SETTINGS,
      isQueryBuilder: true,
    });

    expect(await screen.findByLabelText("Goal warning")).toBeInTheDocument();
    expect(screen.getByText("Goal 0")).toBeInTheDocument();
  });

  it("measures against a goal of 0 without a warning outside the query builder (metabase#85219, metabase#85062)", async () => {
    setup({ goalValues: createMockFailedReferencedEntitiesResults() });

    expect(await screen.findByText("Goal 0")).toBeInTheDocument();
    expect(screen.queryByLabelText("Goal warning")).not.toBeInTheDocument();
  });
});

function getGoalValuesCalls() {
  return fetchMock.callHistory.calls("path:/api/dynamic-goal/values");
}
