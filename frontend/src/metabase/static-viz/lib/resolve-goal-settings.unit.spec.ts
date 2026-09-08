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

describe("resolveGoalSettings", () => {
  it("passes static and unset goals through", () => {
    const settings = { "graph.goal_value": 10 };

    expect(resolveGoalSettings(createSeries(createData({})), settings)).toBe(
      settings,
    );
    expect(resolveGoalSettings(createSeries(createData({})), {})).toEqual({});
  });

  it("passes references through for a display that does not resolve graph goals", () => {
    expect(
      resolveGoalSettings(
        createSeries(createData({}), "scalar"),
        REFERENCED_SETTINGS,
      ),
    ).toBe(REFERENCED_SETTINGS);
  });

  describe("for a display that resolves graph goals", () => {
    mockDynamicGoalSettingKeys(["graph.goal_value"]);

    it("passes a hidden goal line through", () => {
      const settings = { ...REFERENCED_SETTINGS, "graph.show_goal": false };

      expect(resolveGoalSettings(createSeries(createData({})), settings)).toBe(
        settings,
      );
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

      expect(
        resolveGoalSettings(createSeries(answered), REFERENCED_SETTINGS),
      ).toEqual({ ...REFERENCED_SETTINGS, "graph.goal_value": 250 });
    });

    it("throws for an unanswered reference", () => {
      expect(() =>
        resolveGoalSettings(createSeries(createData({})), REFERENCED_SETTINGS),
      ).toThrow("Couldn't load the value this chart's goal line depends on.");
    });

    it("throws for a failed reference", () => {
      const failed = createData({
        card: { 9: { status: "failed", error: "boom" } },
      });

      expect(() =>
        resolveGoalSettings(createSeries(failed), REFERENCED_SETTINGS),
      ).toThrow("Couldn't load the value this chart's goal line depends on.");
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
