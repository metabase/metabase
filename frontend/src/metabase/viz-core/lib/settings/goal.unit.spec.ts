import type { VisualizationSettings } from "metabase-types/api";

import { getChartGoal } from "./goal";

describe("getChartGoal", () => {
  const settings: VisualizationSettings = {
    "graph.show_goal": true,
    "graph.goal_value": 50,
    "graph.goal_label": "Target",
  };

  it("returns nothing when the goal line is off", () => {
    expect(getChartGoal({ ...settings, "graph.show_goal": false })).toBeNull();
  });

  it("returns the goal with its label", () => {
    expect(getChartGoal(settings)).toEqual({ value: 50, label: "Target" });
  });

  it("reads a normalized stack goal as a percentage", () => {
    expect(
      getChartGoal({ ...settings, "stackable.stack_type": "normalized" }),
    ).toEqual({ value: 0.5, label: "Target" });
  });

  it("returns nothing for an empty goal", () => {
    expect(getChartGoal({ ...settings, "graph.goal_value": null })).toBeNull();
  });

  it("returns nothing for an unresolved reference", () => {
    expect(
      getChartGoal({
        ...settings,
        "graph.goal_value": { type: "card", id: 1, column: "sum" },
      }),
    ).toBeNull();
  });
});
