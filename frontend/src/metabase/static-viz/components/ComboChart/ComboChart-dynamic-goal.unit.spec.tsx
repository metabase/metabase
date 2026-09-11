/* eslint-disable testing-library/render-result-naming-convention --
   These tests use ReactDOMServer.renderToStaticMarkup (a server-side string render), not an RTL
   render, so the "view"/"utils" naming convention doesn't apply. */
import ReactDOMServer from "react-dom/server";

import { DYNAMIC_GOAL_CARTESIAN_DISPLAYS } from "__support__/dynamic-goals";
import { createStaticRenderingContext } from "metabase/static-viz/lib/rendering-context";
import type {
  DatasetData,
  RawSeries,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";
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
  createMockColumn({ name: "sum", base_type: "type/Integer" }),
];

const ROWS = [
  ["Jan", 1, 3],
  ["Feb", 2, 2],
  ["Mar", 3, 1],
];

const GOAL_LABEL = "Target";

function answeredGoal(value: number): DatasetData["referenced_entities"] {
  return {
    card: {
      9: {
        status: "completed",
        data: { cols: [createMockColumn({ name: "goal" })], rows: [[value]] },
      },
    },
  };
}

function createSeries(
  display: VisualizationDisplay,
  referenced_entities?: DatasetData["referenced_entities"],
  settings?: VisualizationSettings,
): RawSeries {
  return [
    {
      card: createMockCard({
        display,
        visualization_settings: {
          "graph.dimensions": ["month"],
          "graph.metrics": ["count"],
          "graph.show_goal": true,
          "graph.goal_label": GOAL_LABEL,
          "graph.goal_value": { type: "card", id: 9, column: "goal" },
          ...settings,
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

describe.each(DYNAMIC_GOAL_CARTESIAN_DISPLAYS)(
  "static %s chart with a dynamic goal",
  (display) => {
    it("draws the goal line at the value answered by the dataset", () => {
      const svg = toSvg(createSeries(display, answeredGoal(250)));

      expect(svg).toContain(GOAL_LABEL);
      // the goal is far above every data point, so it stretches the y-axis up to it
      expect(svg).toContain(">250<");
    });

    it("throws for a reference the dataset has not answered", () => {
      expect(() => toSvg(createSeries(display))).toThrow(
        "Couldn't load the value this chart's goal depends on.",
      );
    });

    it("throws for a reference whose query failed", () => {
      expect(() =>
        toSvg(
          createSeries(display, {
            card: { 9: { status: "failed", error: "boom" } },
          }),
        ),
      ).toThrow("Couldn't load the value this chart's goal depends on.");
    });
  },
);

describe("static normalized stacked bar chart with a dynamic goal", () => {
  it("reads the answered goal as a percentage of the stack", () => {
    const svg = toSvg(
      createSeries("bar", answeredGoal(50), {
        "graph.metrics": ["count", "sum"],
        "stackable.stack_type": "normalized",
      }),
    );

    expect(svg).toContain(GOAL_LABEL);
    // the axis stays within 0-100%, instead of stretching to a 50x stack
    expect(svg).not.toContain("5000%");
    // and the line sits halfway between the 0% and 100% ticks
    const midpoint = (getTickY(svg, "0%") + getTickY(svg, "100%")) / 2;
    expect(getGoalLineY(svg)).toBeCloseTo(midpoint, 0);
  });
});

function getTickY(svg: string, label: string) {
  const match = svg.match(
    new RegExp(
      `transform="translate\\([\\d.]+ ([\\d.]+)\\)"[^>]*>${label}</text>`,
    ),
  );
  if (match == null) {
    throw new Error(`no ${label} tick in ${svg}`);
  }
  return Number(match[1]);
}

function getGoalLineY(svg: string) {
  // the goal line is the only dashed path
  const match = svg.match(
    /<path d="M[\d.]+ ([\d.]+)L[^"]*"[^>]*stroke-dasharray=/,
  );
  if (match == null) {
    throw new Error(`no goal line in ${svg}`);
  }
  return Number(match[1]);
}
