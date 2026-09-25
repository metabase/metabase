import ReactDOMServer from "react-dom/server";

import {
  getExpectedRowChartGoalX,
  getRowChartGoalLineX,
  getRowChartSymbols,
} from "__support__/row-chart";
import { createStaticRenderingContext } from "metabase/static-viz/lib/rendering-context";
import type {
  DatasetData,
  RawSeries,
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

describe("static row chart with a dynamic goal", () => {
  it("draws the goal line at a static goal value", () => {
    const root = setup({ settings: { ...SETTINGS, "graph.goal_value": GOAL } });
    const [goalLine] = getRowChartSymbols(root, "goal line");

    expect(goalLine).toHaveTextContent(GOAL_LABEL);
    expect(getRowChartGoalLineX(goalLine)).toBeCloseTo(
      getExpectedRowChartGoalX(root, GOAL, MAX_COUNT),
      0,
    );
  });

  it("draws the goal line at the value answered by the dataset", () => {
    const root = setup({
      referencedEntities: createMockReferencedEntitiesResults({
        column: "goal",
        value: GOAL,
      }),
    });
    const [goalLine] = getRowChartSymbols(root, "goal line");

    expect(goalLine).toHaveTextContent(GOAL_LABEL);
    expect(getRowChartGoalLineX(goalLine)).toBeCloseTo(
      getExpectedRowChartGoalX(root, GOAL, MAX_COUNT),
      0,
    );
  });

  it("reads an answered goal as a percentage of a normalized stack", () => {
    const root = setup({
      settings: { ...SETTINGS, "stackable.stack_type": "normalized" },
      referencedEntities: createMockReferencedEntitiesResults({
        column: "goal",
        value: 50,
      }),
    });
    const [goalLine] = getRowChartSymbols(root, "goal line");
    const [bar] = getRowChartSymbols(root, "bar");
    const barX = Number(bar.getAttribute("x"));
    const barWidth = Number(bar.getAttribute("width"));

    // every normalized bar spans the whole [0, 1] domain, so 50% sits at its middle
    expect(getRowChartGoalLineX(goalLine)).toBeCloseTo(barX + barWidth / 2, 0);
  });

  it("throws for a reference the dataset has not answered", () => {
    expect(() => setup()).toThrow(GOAL_ERROR);
  });

  it("throws for a reference whose query failed", () => {
    expect(() =>
      setup({
        referencedEntities: createMockFailedReferencedEntitiesResults(),
      }),
    ).toThrow(GOAL_ERROR);
  });
});
