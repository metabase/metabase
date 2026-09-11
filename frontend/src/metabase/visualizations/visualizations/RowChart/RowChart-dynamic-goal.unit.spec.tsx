import fetchMock from "fetch-mock";

import { setupCardDataset } from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import { registerVisualizations } from "metabase/visualizations/register";
import { loadVisualizationComponents } from "metabase/viz-core";
import type {
  DatasetData,
  RawSeries,
  ReferencedEntitiesResults,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

registerVisualizations();

// Chart components are loaded on demand. Register the row chart up front so
// each test renders in one pass and can be run on its own.
beforeAll(() => loadVisualizationComponents(["row"]));

const COLS = [
  createMockColumn({ name: "category", base_type: "type/Text" }),
  createMockColumn({ name: "count", base_type: "type/Integer" }),
];
const ROWS = [
  ["Doohickey", 10],
  ["Gadget", 20],
  ["Gizmo", 30],
];
const MAX_COUNT = 30;
const GOAL = 250;
const GOAL_LABEL = "Target";
const GOAL_ERROR = "Couldn't load the value this chart's goal depends on.";
const SETTINGS: VisualizationSettings = {
  "graph.dimensions": ["category"],
  "graph.metrics": ["count"],
  "graph.show_goal": true,
  "graph.goal_value": { type: "card", id: 9, column: "goal" },
  "graph.goal_label": GOAL_LABEL,
};

function answeredGoal(value: number): ReferencedEntitiesResults {
  return {
    card: {
      9: {
        status: "completed",
        data: { cols: [createMockColumn({ name: "goal" })], rows: [[value]] },
      },
    },
  };
}

const FAILED: ReferencedEntitiesResults = {
  card: { 9: { status: "failed", error: "boom" } },
};

type SetupOpts = {
  settings?: VisualizationSettings;
  referencedEntities?: DatasetData["referenced_entities"];
};

function setup({ settings = SETTINGS, referencedEntities }: SetupOpts = {}) {
  const series: RawSeries = [
    createMockSingleSeries(
      createMockCard({ display: "row", visualization_settings: settings }),
      {
        data: createMockDatasetData({
          cols: COLS,
          rows: ROWS,
          referenced_entities: referencedEntities,
        }),
      },
    ),
  ];

  renderWithProviders(<Visualization rawSeries={series} />);

  return { series };
}

function getGraphicsSymbols(roleDescription: string) {
  return screen
    .queryAllByRole("graphics-symbol")
    .filter(
      (element) =>
        element.getAttribute("aria-roledescription") === roleDescription,
    );
}

async function findGoalLine() {
  await waitFor(() => expect(getGraphicsSymbols("goal line")).toHaveLength(1));
  const [goalLine] = getGraphicsSymbols("goal line");
  return goalLine;
}

function getGoalLineX(goalLine: HTMLElement) {
  return Number(goalLine.querySelector("line")?.getAttribute("x1"));
}

// bars start at x = 0 on a linear scale, so a bar's width is its value's scaled length
function getExpectedGoalX(goalValue: number) {
  const bars = getGraphicsSymbols("bar");
  const widestBar = bars.reduce((widest, bar) =>
    Number(bar.getAttribute("width")) > Number(widest.getAttribute("width"))
      ? bar
      : widest,
  );
  const x = Number(widestBar.getAttribute("x"));
  const width = Number(widestBar.getAttribute("width"));
  return x + (width * goalValue) / MAX_COUNT;
}

describe("row chart dynamic goal", () => {
  beforeEach(() => {
    mockGetBoundingClientRect({ width: 800, height: 600 });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("draws the goal line at a static goal value", async () => {
    setup({ settings: { ...SETTINGS, "graph.goal_value": GOAL } });

    const goalLine = await findGoalLine();

    expect(goalLine).toHaveTextContent(GOAL_LABEL);
    expect(getGoalLineX(goalLine)).toBeCloseTo(getExpectedGoalX(GOAL), 0);
  });

  it("draws the goal line at the value answered by the dataset", async () => {
    setup({ referencedEntities: answeredGoal(GOAL) });

    const goalLine = await findGoalLine();

    expect(goalLine).toHaveTextContent(GOAL_LABEL);
    expect(getGoalLineX(goalLine)).toBeCloseTo(getExpectedGoalX(GOAL), 0);
    expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(0);
  });

  it("reads an answered goal as a percentage of a normalized stack", async () => {
    setup({
      settings: { ...SETTINGS, "stackable.stack_type": "normalized" },
      referencedEntities: answeredGoal(50),
    });

    const goalLine = await findGoalLine();
    const [bar] = getGraphicsSymbols("bar");
    const barX = Number(bar.getAttribute("x"));
    const barWidth = Number(bar.getAttribute("width"));

    // every normalized bar spans the whole [0, 1] domain, so 50% sits at its middle
    expect(getGoalLineX(goalLine)).toBeCloseTo(barX + barWidth / 2, 0);
  });

  it("re-runs the query with the referenced entity when the dataset has no answer", async () => {
    setupCardDataset({
      dataset: {
        data: createMockDatasetData({
          cols: COLS,
          rows: ROWS,
          referenced_entities: answeredGoal(GOAL),
        }),
      },
    });
    const { series } = setup();

    const goalLine = await findGoalLine();

    expect(getGoalLineX(goalLine)).toBeCloseTo(getExpectedGoalX(GOAL), 0);
    const [call] = fetchMock.callHistory.calls("path:/api/dataset");
    expect(await call.request?.json()).toEqual(
      expect.objectContaining({
        ...series[0].card.dataset_query,
        referenced_entities: [{ type: "card", id: 9 }],
      }),
    );
  });

  it("shows a loader while the referenced value is being fetched", async () => {
    fetchMock.post("path:/api/dataset", new Promise(() => {}));
    setup();

    expect(await screen.findByTestId("loading-indicator")).toBeInTheDocument();
    expect(getGraphicsSymbols("goal line")).toHaveLength(0);
  });

  it("shows the failed message when fetching the reference fails", async () => {
    setupCardDataset({ status: 500 });
    setup();

    expect(await screen.findByText(GOAL_ERROR)).toBeInTheDocument();
    expect(getGraphicsSymbols("bar")).toHaveLength(0);
  });

  it("refuses to render when the dataset reports the reference as failed", async () => {
    setup({ referencedEntities: FAILED });

    expect(await screen.findByText(GOAL_ERROR)).toBeInTheDocument();
    expect(getGraphicsSymbols("bar")).toHaveLength(0);
    expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(0);
  });
});
