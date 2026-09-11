import type {
  DatasetData,
  RawSeries,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { ROW_CHART_DEFINITION } from "./definition";

const { checkRenderable } = ROW_CHART_DEFINITION;

const COLS = [
  createMockColumn({ name: "category", base_type: "type/Text" }),
  createMockColumn({ name: "count", base_type: "type/Integer" }),
];
const ROWS = [
  ["Doohickey", 10],
  ["Gadget", 20],
];
const REFERENCED_GOAL = { type: "card", id: 9, column: "goal" } as const;
const SETTINGS: VisualizationSettings = {
  "graph.dimensions": ["category"],
  "graph.metrics": ["count"],
  "graph.show_goal": true,
  "graph.goal_value": REFERENCED_GOAL,
};
const GOAL_ERROR = "Couldn't load the value this chart's goal depends on.";

describe("ROW_CHART_DEFINITION", () => {
  describe("graph.goal_value widget", () => {
    it("is dynamic and reads the raw series", () => {
      const series = createSeries();
      const setting = ROW_CHART_DEFINITION.settings?.["graph.goal_value"];

      expect(setting?.widget).toBe("goalValue");
      expect(setting?.useRawSeries).toBe(true);
      expect(
        setting?.getProps?.(series, SETTINGS, jest.fn(), {}, jest.fn()),
      ).toEqual({
        data: series[0].data,
        datasetQuery: series[0].card.dataset_query,
        isDynamic: true,
        showSelfColumns: false,
      });
    });
  });

  describe("checkRenderable", () => {
    it("accepts a static goal value", () => {
      expect(() =>
        checkRenderable(createSeries(), {
          ...SETTINGS,
          "graph.goal_value": 100,
        }),
      ).not.toThrow();
    });

    it("accepts a goal reference that is still resolving", () => {
      expect(() => checkRenderable(createSeries(), SETTINGS)).not.toThrow();
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

      expect(() => checkRenderable(series, SETTINGS)).not.toThrow();
    });

    it("refuses to render when the referenced query failed", () => {
      const series = createSeries({
        referenced_entities: {
          card: { 9: { status: "failed", error: "boom" } },
        },
      });

      expect(() => checkRenderable(series, SETTINGS)).toThrow(GOAL_ERROR);
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

      expect(() => checkRenderable(series, SETTINGS)).toThrow(GOAL_ERROR);
    });
  });
});

function createSeries(data: Partial<DatasetData> = {}): RawSeries {
  return [
    createMockSingleSeries(
      createMockCard({ display: "row", visualization_settings: SETTINGS }),
      { data: createMockDatasetData({ cols: COLS, rows: ROWS, ...data }) },
    ),
  ];
}
