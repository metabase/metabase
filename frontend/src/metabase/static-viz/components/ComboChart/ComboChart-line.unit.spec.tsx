/* eslint-disable testing-library/render-result-naming-convention --
   These tests use ReactDOMServer.renderToStaticMarkup (a server-side string render), not an RTL
   render, so the "view"/"utils" naming convention doesn't apply. */
import ReactDOMServer from "react-dom/server";

import { createStaticRenderingContext } from "metabase/static-viz/lib/rendering-context";
import type { DatasetData, RawSeries } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { StaticVisualization } from "../StaticVisualization";

const renderingContext = createStaticRenderingContext();

const COLS = [
  createMockColumn({ name: "month", base_type: "type/Text" }),
  createMockColumn({ name: "count", base_type: "type/Integer" }),
];

const ROWS = [
  ["Jan", 1],
  ["Feb", 2],
  ["Mar", 3],
];

const GOAL_LABEL = "Target";

function lineSeries(
  referenced_entities?: DatasetData["referenced_entities"],
): RawSeries {
  return [
    {
      card: createMockCard({
        display: "line",
        visualization_settings: {
          "graph.dimensions": ["month"],
          "graph.metrics": ["count"],
          "graph.show_goal": true,
          "graph.goal_label": GOAL_LABEL,
          "graph.goal_value": { type: "card", id: 9, column: "goal" },
        },
      }),
      data: createMockDatasetData({
        cols: COLS,
        rows: ROWS,
        referenced_entities,
      }),
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

describe("static line chart with a dynamic goal", () => {
  it("draws the goal line at the value answered by the dataset", () => {
    const svg = toSvg(
      lineSeries({
        card: {
          9: {
            status: "completed",
            data: { cols: [createMockColumn({ name: "goal" })], rows: [[250]] },
          },
        },
      }),
    );

    expect(svg).toContain(GOAL_LABEL);
    // the goal is far above every data point, so it stretches the y-axis up to it
    expect(svg).toContain(">250<");
  });

  it("throws for a reference the dataset has not answered", () => {
    expect(() => toSvg(lineSeries())).toThrow(
      "Couldn't load the value this chart's goal depends on.",
    );
  });

  it("throws for a reference whose query failed", () => {
    expect(() =>
      toSvg(lineSeries({ card: { 9: { status: "failed", error: "boom" } } })),
    ).toThrow("Couldn't load the value this chart's goal depends on.");
  });
});
