import ReactDOMServer from "react-dom/server";

import { createStaticRenderingContext } from "metabase/static-viz/lib/rendering-context";
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

import { StaticVisualization } from "../StaticVisualization";

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

type SetupOpts = {
  settings?: VisualizationSettings;
  referencedEntities?: DatasetData["referenced_entities"];
};

function setup({ settings = SETTINGS, referencedEntities }: SetupOpts = {}) {
  const rawSeries: RawSeries = [
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

  const root = document.createElement("div");
  root.innerHTML = ReactDOMServer.renderToStaticMarkup(
    <StaticVisualization
      rawSeries={rawSeries}
      renderingContext={createStaticRenderingContext()}
    />,
  );
  return root;
}

function getGoalLine(root: HTMLElement) {
  return root.querySelector('[aria-roledescription="goal line"]');
}

function getGoalLineX(root: HTMLElement) {
  return Number(getGoalLine(root)?.querySelector("line")?.getAttribute("x1"));
}

// bars start at x = 0 on a linear scale, so a bar's width is its value's scaled length
function getExpectedGoalX(root: HTMLElement, goalValue: number) {
  const bars = Array.from(
    root.querySelectorAll('[aria-roledescription="bar"]'),
  );
  const widestBar = bars.reduce((widest, bar) =>
    Number(bar.getAttribute("width")) > Number(widest.getAttribute("width"))
      ? bar
      : widest,
  );
  const x = Number(widestBar.getAttribute("x"));
  const width = Number(widestBar.getAttribute("width"));
  return x + (width * goalValue) / MAX_COUNT;
}

describe("static row chart with a dynamic goal", () => {
  it("draws the goal line at a static goal value", () => {
    const root = setup({ settings: { ...SETTINGS, "graph.goal_value": GOAL } });

    expect(getGoalLine(root)).toHaveTextContent(GOAL_LABEL);
    expect(getGoalLineX(root)).toBeCloseTo(getExpectedGoalX(root, GOAL), 0);
  });

  it("draws the goal line at the value answered by the dataset", () => {
    const root = setup({ referencedEntities: answeredGoal(GOAL) });

    expect(getGoalLine(root)).toHaveTextContent(GOAL_LABEL);
    expect(getGoalLineX(root)).toBeCloseTo(getExpectedGoalX(root, GOAL), 0);
  });

  it("reads an answered goal as a percentage of a normalized stack", () => {
    const root = setup({
      settings: { ...SETTINGS, "stackable.stack_type": "normalized" },
      referencedEntities: answeredGoal(50),
    });
    const bar = root.querySelector('[aria-roledescription="bar"]');
    const barX = Number(bar?.getAttribute("x"));
    const barWidth = Number(bar?.getAttribute("width"));

    // every normalized bar spans the whole [0, 1] domain, so 50% sits at its middle
    expect(getGoalLineX(root)).toBeCloseTo(barX + barWidth / 2, 0);
  });

  it("throws for a reference the dataset has not answered", () => {
    expect(() => setup()).toThrow(GOAL_ERROR);
  });

  it("throws for a reference whose query failed", () => {
    expect(() =>
      setup({
        referencedEntities: {
          card: { 9: { status: "failed", error: "boom" } },
        },
      }),
    ).toThrow(GOAL_ERROR);
  });
});
