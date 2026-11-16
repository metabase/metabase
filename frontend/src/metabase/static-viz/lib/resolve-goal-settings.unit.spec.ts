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

    it("keeps the value the backend substituted for a reference", () => {
      const settings = { ...REFERENCED_SETTINGS, "graph.goal_value": 250 };

      expect(resolveGoalSettings(createSeries(display), settings)).toEqual(
        settings,
      );
    });

    it("hides the goal line for a reference the backend left unresolved", () => {
      const series = createSeries(display);

      expect(resolveGoalSettings(series, REFERENCED_SETTINGS)).toEqual({
        "graph.show_goal": false,
        "graph.goal_value": null,
      });
    });
  });
});

function createSeries(display: VisualizationDisplay) {
  return createMockSingleSeries(
    { display },
    {
      data: createMockDatasetData({
        cols: [createMockColumn({ name: "count" })],
        rows: [[1]],
      }),
    },
  );
}
