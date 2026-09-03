import type { VisualizationSettings } from "metabase-types/api";

import { getChartGoal, getNumericGoalValue } from "./goal";

describe("getNumericGoalValue", () => {
  it("returns a static goal", () => {
    expect(getNumericGoalValue({ "graph.goal_value": 42 })).toBe(42);
    expect(getNumericGoalValue({ "graph.goal_value": 0 })).toBe(0);
  });

  it("returns null for an unset goal", () => {
    expect(getNumericGoalValue({})).toBeNull();
    expect(getNumericGoalValue({ "graph.goal_value": null })).toBeNull();
  });

  it("returns null for an unresolved reference", () => {
    expect(getNumericGoalValue({ "graph.goal_value": "count" })).toBeNull();
    expect(
      getNumericGoalValue({
        "graph.goal_value": { type: "card", id: 1, column: "sum" },
      }),
    ).toBeNull();
  });
});

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

  it("falls back to zero for an unresolved reference", () => {
    expect(
      getChartGoal({
        ...settings,
        "graph.goal_value": { type: "card", id: 1, column: "sum" },
      }),
    ).toEqual({ value: 0, label: "Target" });
  });
});
