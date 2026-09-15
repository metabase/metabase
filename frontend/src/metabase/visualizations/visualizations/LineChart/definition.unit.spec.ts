import type {
  DatasetData,
  Series,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { LINE_CHART_DEFINITION } from "./definition";

const { checkRenderable } = LINE_CHART_DEFINITION;

const COLS = [
  createMockColumn({ name: "month", base_type: "type/Text" }),
  createMockColumn({ name: "count", base_type: "type/Integer" }),
];

const GOAL_LINE_SETTINGS: VisualizationSettings = {
  "graph.dimensions": ["month"],
  "graph.metrics": ["count"],
  "graph.show_goal": true,
};

const REFERENCED_GOAL = { type: "card", id: 9, column: "goal" } as const;

const GOAL_ERROR = "Couldn't load the value this chart's goal depends on.";

describe("LINE_CHART_DEFINITION", () => {
  describe("checkRenderable", () => {
    it("accepts a static goal value", () => {
      expect(() =>
        checkRenderable(createSeries(), {
          ...GOAL_LINE_SETTINGS,
          "graph.goal_value": 100,
        }),
      ).not.toThrow();
    });

    it("accepts a goal reference that is still resolving", () => {
      expect(() =>
        checkRenderable(createSeries(), {
          ...GOAL_LINE_SETTINGS,
          "graph.goal_value": REFERENCED_GOAL,
        }),
      ).not.toThrow();
    });

    it("accepts a resolved goal reference", () => {
      const series = createSeries({
        referenced_entities: {
          card: {
            9: {
              status: "completed",
              data: {
                cols: [createMockColumn({ name: "goal" })],
                rows: [[250]],
              },
            },
          },
        },
      });

      expect(() =>
        checkRenderable(series, {
          ...GOAL_LINE_SETTINGS,
          "graph.goal_value": REFERENCED_GOAL,
        }),
      ).not.toThrow();
    });

    it("refuses to render when the referenced query failed", () => {
      const series = createSeries({
        referenced_entities: {
          card: { 9: { status: "failed", error: "boom" } },
        },
      });

      expect(() =>
        checkRenderable(series, {
          ...GOAL_LINE_SETTINGS,
          "graph.goal_value": REFERENCED_GOAL,
        }),
      ).toThrow(GOAL_ERROR);
    });

    it("refuses to render when the referenced value is not a number", () => {
      const series = createSeries({
        referenced_entities: {
          card: {
            9: {
              status: "completed",
              data: {
                cols: [createMockColumn({ name: "goal" })],
                rows: [["x"]],
              },
            },
          },
        },
      });

      expect(() =>
        checkRenderable(series, {
          ...GOAL_LINE_SETTINGS,
          "graph.goal_value": REFERENCED_GOAL,
        }),
      ).toThrow(GOAL_ERROR);
    });

    it("reads the raw series when given a transformed one", () => {
      const rawSeries = createSeries({
        referenced_entities: {
          card: { 9: { status: "failed", error: "boom" } },
        },
      });
      const transformed = Object.assign(createSeries(), { _raw: rawSeries });

      expect(() =>
        checkRenderable(transformed, {
          ...GOAL_LINE_SETTINGS,
          "graph.goal_value": REFERENCED_GOAL,
        }),
      ).toThrow(GOAL_ERROR);
    });
  });
});

function createSeries(data: Partial<DatasetData> = {}): Series {
  return [
    createMockSingleSeries(createMockCard({ display: "line" }), {
      data: createMockDatasetData({
        cols: COLS,
        rows: [
          ["Jan", 10],
          ["Feb", 20],
        ],
        ...data,
      }),
    }),
  ];
}
