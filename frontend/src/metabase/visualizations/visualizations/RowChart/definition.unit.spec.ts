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

describe("ROW_CHART_DEFINITION", () => {
  describe("graph.goal_value widget", () => {
    it("reads the raw series", () => {
      const series = createSeries();
      const setting = ROW_CHART_DEFINITION.settings?.["graph.goal_value"];

      expect(setting?.widget).toBe("goalValue");
      expect(setting?.useRawSeries).toBe(true);
      expect(
        setting?.getProps?.(series, SETTINGS, jest.fn(), {}, jest.fn()),
      ).toEqual({
        data: series[0].data,
        datasetQuery: series[0].card.dataset_query,
        formatOptions: expect.any(Object),
        showSelfColumns: false,
      });
    });
  });

  describe("checkRenderable", () => {
    it("renders when the referenced query failed", () => {
      const series = createSeries({
        referenced_entities: createMockFailedReferencedEntitiesResults(),
      });

      expect(() => checkRenderable(series, SETTINGS)).not.toThrow();
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
