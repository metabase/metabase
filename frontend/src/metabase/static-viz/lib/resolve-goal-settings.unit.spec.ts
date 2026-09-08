import { mockDynamicGoalSettingKeys } from "__support__/dynamic-goals";
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

function series(data: DatasetData, display: VisualizationDisplay = "line") {
  return createMockSingleSeries({ display }, { data });
}

function data(referenced_entities: DatasetData["referenced_entities"]) {
  return createMockDatasetData({
    cols: [createMockColumn({ name: "count" })],
    rows: [[1]],
    referenced_entities,
  });
}

describe("resolveGoalSettings", () => {
  it("passes static and unset goals through", () => {
    const settings = { "graph.goal_value": 10 };

    expect(resolveGoalSettings(series(data({})), settings)).toBe(settings);
    expect(resolveGoalSettings(series(data({})), {})).toEqual({});
  });

  it("passes references through for a display that does not resolve graph goals", () => {
    expect(
      resolveGoalSettings(series(data({}), "scalar"), REFERENCED_SETTINGS),
    ).toBe(REFERENCED_SETTINGS);
  });

  describe("for a display that resolves graph goals", () => {
    mockDynamicGoalSettingKeys(["graph.goal_value"]);

    it("passes a hidden goal line through", () => {
      const settings = { ...REFERENCED_SETTINGS, "graph.show_goal": false };

      expect(resolveGoalSettings(series(data({})), settings)).toBe(settings);
    });

    it("substitutes the referenced value", () => {
      const answered = data({
        card: {
          9: {
            status: "completed",
            data: { cols: [createMockColumn({ name: "goal" })], rows: [[250]] },
          },
        },
      });

      expect(
        resolveGoalSettings(series(answered), REFERENCED_SETTINGS),
      ).toEqual({ ...REFERENCED_SETTINGS, "graph.goal_value": 250 });
    });

    it("throws for an unanswered reference", () => {
      expect(() =>
        resolveGoalSettings(series(data({})), REFERENCED_SETTINGS),
      ).toThrow("Couldn't load the value this chart's goal line depends on.");
    });

    it("throws for a failed reference", () => {
      const failed = data({ card: { 9: { status: "failed", error: "boom" } } });

      expect(() =>
        resolveGoalSettings(series(failed), REFERENCED_SETTINGS),
      ).toThrow("Couldn't load the value this chart's goal line depends on.");
    });
  });
});
