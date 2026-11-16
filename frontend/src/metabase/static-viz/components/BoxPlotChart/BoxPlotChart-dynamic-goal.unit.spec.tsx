/* eslint-disable testing-library/render-result-naming-convention --
   These tests use ReactDOMServer.renderToStaticMarkup (a server-side string render), not an RTL
   render, so the "view"/"utils" naming convention doesn't apply. */
import ReactDOMServer from "react-dom/server";

import { createStaticRenderingContext } from "metabase/static-viz/lib/rendering-context";
import type { GoalValue, RawSeries } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { StaticVisualization } from "../StaticVisualization";

const renderingContext = createStaticRenderingContext();

const COLS = [
  createMockColumn({ name: "category", base_type: "type/Text" }),
  createMockColumn({ name: "count", base_type: "type/Integer" }),
];

const ROWS = [
  ["Doohickey", 1],
  ["Doohickey", 2],
  ["Gadget", 2],
  ["Gadget", 3],
];

const GOAL_LABEL = "Target";

// the backend substitutes a goal it resolves, so a reference here is one it couldn't resolve
const UNRESOLVED_GOAL: GoalValue = { type: "card", id: 9, column: "goal" };

describe("static box plot with a dynamic goal", () => {
  it("draws the goal line at the value the backend resolved", () => {
    const svg = toSvg(createSeries(250));

    expect(svg).toContain(GOAL_LABEL);
    // the goal is far above every data point, so it stretches the y-axis up to it
    expect(svg).toContain(">250<");
  });

  it("draws no goal line for a reference the backend left unresolved", () => {
    const svg = toSvg(createSeries(UNRESOLVED_GOAL));

    expect(svg).toContain("Gadget");
    expect(svg).not.toContain(GOAL_LABEL);
  });
});

function createSeries(goalValue: GoalValue): RawSeries {
  return [
    {
      card: createMockCard({
        display: "boxplot",
        visualization_settings: {
          "graph.dimensions": ["category"],
          "graph.metrics": ["count"],
          "graph.show_goal": true,
          "graph.goal_label": GOAL_LABEL,
          "graph.goal_value": goalValue,
        },
      }),
      data: createMockDatasetData({ cols: COLS, rows: ROWS }),
    },
  ];
}

function toSvg(rawSeries: RawSeries) {
  return ReactDOMServer.renderToStaticMarkup(
    <StaticVisualization
      rawSeries={rawSeries}
      renderingContext={renderingContext}
    />,
  );
}
