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
  createMockFailedReferencedEntitiesResults,
  createMockReferencedEntitiesResults,
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
const GOAL_ERROR = "Couldn't load the value this chart's goal depends on.";

describe("static box plot with a dynamic goal", () => {
  it("draws the goal line at the value answered by the dataset", () => {
    const svg = toSvg(
      createSeries(
        createMockReferencedEntitiesResults({ column: "goal", value: 250 }),
      ),
    );

    expect(svg).toContain(GOAL_LABEL);
    // the goal is far above every data point, so it stretches the y-axis up to it
    expect(svg).toContain(">250<");
  });

  it("throws for a reference the dataset has not answered", () => {
    expect(() => toSvg(createSeries())).toThrow(GOAL_ERROR);
  });

  it("throws for a reference whose query failed", () => {
    expect(() =>
      toSvg(createSeries(createMockFailedReferencedEntitiesResults())),
    ).toThrow(GOAL_ERROR);
  });
});

function createSeries(
  referenced_entities?: DatasetData["referenced_entities"],
): RawSeries {
  return [
    {
      card: createMockCard({
        display: "boxplot",
        visualization_settings: {
          "graph.dimensions": ["category"],
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
