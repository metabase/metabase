import type {
  DatasetData,
  RawSeries,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockFailedReferencedEntitiesResults,
  createMockReferencedEntitiesResults,
  createMockSingleSeries,
} from "metabase-types/api/mocks";
import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks/dataset";

import { BOXPLOT_CHART_DEFINITION } from "./definition";

const categoryColumn = createMockColumn({
  name: "Category",
  display_name: "Category",
  base_type: "type/Text",
  source: "breakout",
});

const idColumn = createMockColumn({
  name: "ID",
  display_name: "ID",
  base_type: "type/Integer",
  semantic_type: "type/PK",
  source: "breakout",
});

const metricColumn = createMockColumn({
  name: "Value",
  display_name: "Value",
  base_type: "type/Number",
  source: "aggregation",
});

const columns = [categoryColumn, idColumn, metricColumn];

const GOAL_SETTINGS: VisualizationSettings = {
  "graph.dimensions": ["Category"],
  "graph.metrics": ["Value"],
  "graph.show_goal": true,
  "graph.goal_value": { type: "card", id: 9, column: "goal" },
};
const GOAL_ERROR = "Couldn't load the value this chart's goal depends on.";

describe("BoxPlot", () => {
  describe("isSensible", () => {
    it("should return true for data with two dimensions and a metric", () => {
      const data = createMockDatasetData({
        rows: [
          ["A", 1, 10],
          ["A", 2, 20],
          ["A", 3, 30],
          ["A", 4, 40],
          ["A", 5, 50],
        ],
        cols: columns,
      });

      expect(BOXPLOT_CHART_DEFINITION.isSensible?.(data)).toBe(true);
    });

    it("should return false when there is only one dimension column", () => {
      const data = createMockDatasetData({
        rows: [
          ["A", 10],
          ["A", 20],
          ["A", 30],
          ["A", 40],
          ["A", 50],
        ],
        cols: [categoryColumn, metricColumn],
      });

      expect(BOXPLOT_CHART_DEFINITION.isSensible?.(data)).toBe(false);
    });

    it("should return false when there are no rows", () => {
      const data = createMockDatasetData({
        rows: [],
        cols: columns,
      });

      expect(BOXPLOT_CHART_DEFINITION.isSensible?.(data)).toBe(false);
    });

    it("should return false when there is no metric column", () => {
      const columnsWithoutMetric = [
        createMockColumn({
          name: "Category1",
          display_name: "Category1",
          base_type: "type/Text",
          source: "breakout",
        }),
        createMockColumn({
          name: "Category2",
          display_name: "Category2",
          base_type: "type/Text",
          source: "breakout",
        }),
      ];

      const data = createMockDatasetData({
        rows: [
          ["A", "X"],
          ["B", "Y"],
          ["C", "Z"],
          ["D", "W"],
          ["E", "V"],
        ],
        cols: columnsWithoutMetric,
      });

      expect(BOXPLOT_CHART_DEFINITION.isSensible?.(data)).toBe(false);
    });

    it("should return true for multiple categories with sufficient total rows", () => {
      const data = createMockDatasetData({
        rows: [
          ["A", 1, 10],
          ["A", 2, 20],
          ["B", 3, 30],
          ["B", 4, 40],
          ["B", 5, 50],
        ],
        cols: columns,
      });

      expect(BOXPLOT_CHART_DEFINITION.isSensible?.(data)).toBe(true);
    });
  });

  describe("graph.goal_value widget", () => {
    it("is dynamic and reads the raw series", () => {
      const series = createGoalSeries();
      const setting = BOXPLOT_CHART_DEFINITION.settings?.["graph.goal_value"];

      expect(setting?.widget).toBe("goalValue");
      expect(setting?.useRawSeries).toBe(true);
      expect(
        setting?.getProps?.(series, GOAL_SETTINGS, jest.fn(), {}, jest.fn()),
      ).toEqual({
        data: series[0].data,
        datasetQuery: series[0].card.dataset_query,
        isDynamic: true,
        showSelfColumns: false,
      });
    });
  });

  describe("checkRenderable", () => {
    const { checkRenderable } = BOXPLOT_CHART_DEFINITION;

    it("accepts a static goal value", () => {
      expect(() =>
        checkRenderable(createGoalSeries(), {
          ...GOAL_SETTINGS,
          "graph.goal_value": 100,
        }),
      ).not.toThrow();
    });

    it("accepts a goal reference that is still resolving", () => {
      expect(() =>
        checkRenderable(createGoalSeries(), GOAL_SETTINGS),
      ).not.toThrow();
    });

    it("accepts a resolved goal reference", () => {
      const series = createGoalSeries({
        referenced_entities: createMockReferencedEntitiesResults({
          column: "goal",
          value: 250,
        }),
      });

      expect(() => checkRenderable(series, GOAL_SETTINGS)).not.toThrow();
    });

    it("refuses to render when the referenced query failed", () => {
      const series = createGoalSeries({
        referenced_entities: createMockFailedReferencedEntitiesResults(),
      });

      expect(() => checkRenderable(series, GOAL_SETTINGS)).toThrow(GOAL_ERROR);
    });

    it("refuses to render when the referenced value is not a number", () => {
      const series = createGoalSeries({
        referenced_entities: createMockReferencedEntitiesResults({
          column: "goal",
          value: "x",
        }),
      });

      expect(() => checkRenderable(series, GOAL_SETTINGS)).toThrow(GOAL_ERROR);
    });
  });
});

function createGoalSeries(data: Partial<DatasetData> = {}): RawSeries {
  return [
    createMockSingleSeries(
      createMockCard({
        display: "boxplot",
        visualization_settings: GOAL_SETTINGS,
      }),
      {
        data: createMockDatasetData({
          cols: [categoryColumn, metricColumn],
          rows: [
            ["A", 10],
            ["A", 20],
          ],
          ...data,
        }),
      },
    ),
  ];
}
