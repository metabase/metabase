import { mockDynamicGoalSettingKeys } from "__support__/dynamic-goals";
import type {
  Series,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockColumn,
  createMockDatasetData,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { validateGoalReferences } from "./validation";

const FAILED_DATA = createMockDatasetData({
  cols: [createMockColumn({ name: "count" })],
  rows: [[1]],
  referenced_entities: { card: { 9: { status: "failed", error: "boom" } } },
});

const REFERENCED_SETTINGS: VisualizationSettings = {
  "graph.show_goal": true,
  "graph.goal_value": { type: "card", id: 9, column: "goal" },
};

describe("validateGoalReferences", () => {
  it("accepts a static goal", () => {
    expect(() =>
      validateGoalReferences(createSeries(), { "graph.goal_value": 10 }),
    ).not.toThrow();
  });

  it("ignores references for a display that does not resolve graph goals", () => {
    expect(() =>
      validateGoalReferences(
        createSeries(FAILED_DATA, "scalar"),
        REFERENCED_SETTINGS,
      ),
    ).not.toThrow();
  });

  describe("for a gauge", () => {
    const REFERENCED_RANGES: VisualizationSettings = {
      "gauge.segments": [
        { min: 0, max: { type: "card", id: 9, column: "goal" }, color: "red" },
      ],
    };

    it("accepts static ranges", () => {
      expect(() =>
        validateGoalReferences(createSeries(FAILED_DATA, "gauge"), {
          "gauge.segments": [{ min: 0, max: 100, color: "red" }],
        }),
      ).not.toThrow();
    });

    it("accepts a range bound the data has not answered yet", () => {
      const data = createMockDatasetData({
        ...FAILED_DATA,
        referenced_entities: {},
      });

      expect(() =>
        validateGoalReferences(createSeries(data, "gauge"), REFERENCED_RANGES),
      ).not.toThrow();
    });

    it("rejects a range bound the data reports as failed", () => {
      expect(() =>
        validateGoalReferences(
          createSeries(FAILED_DATA, "gauge"),
          REFERENCED_RANGES,
        ),
      ).toThrow("Couldn't load a value one of this chart's ranges depends on.");
    });
  });

  describe("for a display that resolves graph goals", () => {
    mockDynamicGoalSettingKeys(["graph.goal_value"]);

    it("ignores a failed reference when the goal line is hidden", () => {
      expect(() =>
        validateGoalReferences(createSeries(), {
          ...REFERENCED_SETTINGS,
          "graph.show_goal": false,
        }),
      ).not.toThrow();
    });

    it("accepts a reference the data has not answered yet", () => {
      const data = createMockDatasetData({
        ...FAILED_DATA,
        referenced_entities: {},
      });

      expect(() =>
        validateGoalReferences(createSeries(data), REFERENCED_SETTINGS),
      ).not.toThrow();
    });

    it("rejects a reference the data reports as failed", () => {
      expect(() =>
        validateGoalReferences(createSeries(), REFERENCED_SETTINGS),
      ).toThrow("Couldn't load the value this chart's goal depends on.");
    });

    it("reads the raw series when given a transformed one", () => {
      const transformedData = createMockDatasetData({
        ...FAILED_DATA,
        referenced_entities: undefined,
      });
      const transformed = Object.assign(createSeries(transformedData), {
        _raw: createSeries(),
      });

      expect(() =>
        validateGoalReferences(transformed, REFERENCED_SETTINGS),
      ).toThrow();
    });
  });
});

function createSeries(
  data = FAILED_DATA,
  display: VisualizationDisplay = "line",
): Series {
  return [createMockSingleSeries({ display }, { data })];
}
