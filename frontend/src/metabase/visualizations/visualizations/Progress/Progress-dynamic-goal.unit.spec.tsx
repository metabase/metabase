import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupGoalSourceResultsEndpoint,
  setupPublicDashcardGoalSourceResultsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { defer } from "metabase/utils/promise";
import { GoalSourcesScopeProvider } from "metabase/visualizations/components/GoalSourcesScope";
import Visualization from "metabase/visualizations/components/Visualization";
import { registerVisualizations } from "metabase/visualizations/register";
import { loadVisualizationComponents } from "metabase/viz-core";
import type {
  DatasetColumn,
  GoalSourceResults,
  GoalSourcesScope,
  RawSeries,
  RowValues,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockFailedGoalSourceResults,
  createMockGoalSourceResults,
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

const PUBLIC_DASHCARD_SCOPE = {
  type: "public-dashcard",
  uuid: "public-dashboard-uuid",
  dashcardId: 3,
  cardId: 1,
} satisfies GoalSourcesScope;

type SetupOpts = {
  cols?: DatasetColumn[];
  goalSourceResults?: GoalSourceResults;
  isQueryBuilder?: boolean;
  rows?: RowValues[];
  scope?: GoalSourcesScope;
  settings?: VisualizationSettings;
};

function setup({
  cols = COLS,
  goalSourceResults,
  isQueryBuilder = false,
  rows = ROWS,
  scope = { type: "signed-in" },
  settings = SETTINGS,
}: SetupOpts = {}) {
  if (goalSourceResults != null) {
    setupGoalSourceResultsEndpoint(goalSourceResults);
  }

  const series: RawSeries = [
    createMockSingleSeries(
      createMockCard({ display: "progress", visualization_settings: settings }),
      { data: createMockDatasetData({ cols, rows }) },
    ),
  ];

  const onOpenChartSettings = jest.fn<void, [unknown]>();

  renderWithProviders(
    <GoalSourcesScopeProvider scope={scope}>
      <Visualization
        isQueryBuilder={isQueryBuilder}
        rawSeries={series}
        onOpenChartSettings={onOpenChartSettings}
      />
    </GoalSourcesScopeProvider>,
  );

  return { onOpenChartSettings };
}

describe("progress chart dynamic goal", () => {
  it("measures progress against a static goal value", async () => {
    setup({ settings: { "progress.goal": 250 } });

    expect(await screen.findByText("Goal 250")).toBeInTheDocument();
  });

  it("measures progress against the value of the goal source", async () => {
    setup({ goalSourceResults: createMockGoalSourceResults({ value: 250 }) });

    expect(await screen.findByText("Goal 250")).toBeInTheDocument();
    expect(await getGoalSourceResultsRequestBodies()).toEqual([
      { sources: [{ type: "card", id: 9 }] },
    ]);
    expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(0);
  });

  it("reads the goal source from the public dashcard goal route inside a public dashcard", async () => {
    setupPublicDashcardGoalSourceResultsEndpoint({
      ...PUBLIC_DASHCARD_SCOPE,
      response: createMockGoalSourceResults({ value: 250 }),
    });
    setup({ scope: PUBLIC_DASHCARD_SCOPE });

    expect(await screen.findByText("Goal 250")).toBeInTheDocument();
    expect(
      fetchMock.callHistory.calls("public-dashcard-goal-source-results"),
    ).toHaveLength(1);
    expect(
      fetchMock.callHistory.calls("path:/api/dynamic-goal/values"),
    ).toHaveLength(0);
  });

  it("formats the goal with this chart's column settings", async () => {
    setup({
      settings: {
        ...SETTINGS,
        column_settings: { '["name","count"]': { prefix: "$" } },
      },
      goalSourceResults: createMockGoalSourceResults({ value: 2500 }),
    });

    expect(await screen.findByText("Goal $2,500")).toBeInTheDocument();
  });

  it("shows a loader while the goal source value is being fetched", async () => {
    const response = defer<GoalSourceResults>();
    setupGoalSourceResultsEndpoint(() => response.promise);
    setup();

    expect(await screen.findByTestId("loading-indicator")).toBeInTheDocument();
    expect(screen.queryByTestId("progress-bar")).not.toBeInTheDocument();

    response.resolve(createMockGoalSourceResults({ value: 250 }));
    expect(await screen.findByText("Goal 250")).toBeInTheDocument();
  });

  it("measures against a goal of 0 with a warning in the query builder when fetching the goal source fails (metabase#85219)", async () => {
    setupGoalSourceResultsEndpoint(500);
    setup({ isQueryBuilder: true });

    expect(await screen.findByLabelText("Goal warning")).toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument();
    expect(screen.getByText("Goal 0")).toBeInTheDocument();
    expect(screen.getByText("Goal exceeded")).toBeInTheDocument();
  });

  // a failed goal also reads 0, so this tells the two apart
  it("measures against an answered goal of 0 without a warning in the query builder", async () => {
    setup({
      goalSourceResults: createMockGoalSourceResults({ value: 0 }),
      isQueryBuilder: true,
    });

    expect(await screen.findByText("Goal 0")).toBeInTheDocument();
    expect(screen.getByText("Goal exceeded")).toBeInTheDocument();
    expect(screen.queryByLabelText("Goal warning")).not.toBeInTheDocument();
  });

  it("opens the goal settings from the warning", async () => {
    const { onOpenChartSettings } = setup({
      goalSourceResults: createMockFailedGoalSourceResults({ error: "boom" }),
      isQueryBuilder: true,
    });

    await userEvent.hover(await screen.findByLabelText("Goal warning"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Couldn't get the goal value. Click to open settings.",
    );

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
    setup({ goalSourceResults: createMockFailedGoalSourceResults() });

    expect(await screen.findByText("Goal 0")).toBeInTheDocument();
    expect(screen.queryByLabelText("Goal warning")).not.toBeInTheDocument();
  });
});

function getGoalSourceResultsRequestBodies(): Promise<unknown[]> {
  return Promise.all(
    fetchMock.callHistory
      .calls("path:/api/dynamic-goal/values")
      .map((call) => call.request?.json()),
  );
}
