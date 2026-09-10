import type { ComputedVisualizationSettings } from "metabase/viz-core";
import type { DatasetData, VisualizationDisplay } from "metabase-types/api";
import {
  createMockColumn,
  createMockDatasetData,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { resolveGoalSettings } from "./resolve-goal-settings";

const REFERENCED_SETTINGS: ComputedVisualizationSettings = {
  "graph.show_goal": true,
  "graph.goal_value": { type: "card", id: 9, column: "goal" },
};

describe("resolveGoalSettings", () => {
  it("passes static and unset goals through", () => {
    const settings = { "graph.goal_value": 10 };
    const series = createSeries(createData({}));

    expect(resolveGoalSettings(series, settings)).toBe(settings);
    expect(resolveGoalSettings(series, {})).toEqual({});
  });

  it("passes references through for a display that does not resolve graph goals", () => {
    const series = createSeries(createData({}), "scalar");

    expect(resolveGoalSettings(series, REFERENCED_SETTINGS)).toBe(
      REFERENCED_SETTINGS,
    );
  });

  describe("for a line chart", () => {
    it("passes a hidden goal line through", () => {
      const settings = { ...REFERENCED_SETTINGS, "graph.show_goal": false };
      const series = createSeries(createData({}));

      expect(resolveGoalSettings(series, settings)).toBe(settings);
    });

    it("substitutes the referenced value", () => {
      const answered = createData({
        card: {
          9: {
            status: "completed",
            data: { cols: [createMockColumn({ name: "goal" })], rows: [[250]] },
          },
        },
      });
      const series = createSeries(answered);

      expect(resolveGoalSettings(series, REFERENCED_SETTINGS)).toEqual({
        ...REFERENCED_SETTINGS,
        "graph.goal_value": 250,
      });
    });

    it("throws for an unanswered reference", () => {
      const series = createSeries(createData({}));

      expect(() => resolveGoalSettings(series, REFERENCED_SETTINGS)).toThrow(
        "Couldn't load the value this chart's goal depends on.",
      );
    });

    it("throws for a failed reference", () => {
      const failed = createData({
        card: { 9: { status: "failed", error: "boom" } },
      });
      const series = createSeries(failed);

      expect(() => resolveGoalSettings(series, REFERENCED_SETTINGS)).toThrow(
        "Couldn't load the value this chart's goal depends on.",
      );
    });
  });
});

function createSeries(
  data: DatasetData,
  display: VisualizationDisplay = "line",
) {
  return createMockSingleSeries({ display }, { data });
}

function createData(referencedEntities: DatasetData["referenced_entities"]) {
  return createMockDatasetData({
    cols: [createMockColumn({ name: "count" })],
    rows: [[1]],
    referenced_entities: referencedEntities,
  });
}
