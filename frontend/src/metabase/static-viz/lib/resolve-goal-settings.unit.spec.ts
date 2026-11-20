import { DYNAMIC_GOAL_DISPLAYS } from "__support__/dynamic-goals";
import type { ComputedVisualizationSettings } from "metabase/viz-core";
import type { VisualizationDisplay } from "metabase-types/api";
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
    const series = createSeries("line");

    expect(resolveGoalSettings(series, settings)).toBe(settings);
    expect(resolveGoalSettings(series, {})).toEqual({});
  });

  it("passes references through for a display that does not resolve graph goals", () => {
    const series = createSeries("scalar");

    expect(resolveGoalSettings(series, REFERENCED_SETTINGS)).toBe(
      REFERENCED_SETTINGS,
    );
  });

  describe.each(DYNAMIC_GOAL_DISPLAYS)("for a %s chart", (display) => {
    it("passes a hidden goal line through", () => {
      const settings = { ...REFERENCED_SETTINGS, "graph.show_goal": false };
      const series = createSeries(display);

      expect(resolveGoalSettings(series, settings)).toBe(settings);
    });

    it("substitutes the value of a column of the chart", () => {
      const settings = { "graph.show_goal": true, "graph.goal_value": "count" };
      const series = createSeries(display);

      expect(resolveGoalSettings(series, settings)).toEqual({
        ...settings,
        "graph.goal_value": 1,
      });
    });

    // the backend resolves references before rendering, so one left over couldn't resolve
    it("hides the goal line for a reference to another entity", () => {
      const series = createSeries(display);

      expect(resolveGoalSettings(series, REFERENCED_SETTINGS)).toEqual({
        "graph.show_goal": false,
        "graph.goal_value": null,
      });
    });
  });
});

function createSeries(display: VisualizationDisplay) {
  const data = createMockDatasetData({
    cols: [createMockColumn({ name: "count" })],
    rows: [[1]],
  });

  return createMockSingleSeries({ display }, { data });
}
