import { mockDynamicGoalSettingKeys } from "__support__/dynamic-goals";

import {
  GOAL_SETTINGS,
  getDynamicGoalSettingKeys,
} from "./dynamic-goal-settings";

describe("getDynamicGoalSettingKeys", () => {
  it("lists the goal settings a display resolves", () => {
    expect(getDynamicGoalSettingKeys("bar")).toEqual(["graph.goal_value"]);
    expect(getDynamicGoalSettingKeys("gauge")).toEqual(["gauge.segments"]);
    expect(getDynamicGoalSettingKeys("line")).toEqual(["graph.goal_value"]);
    expect(getDynamicGoalSettingKeys("row")).toEqual(["graph.goal_value"]);
    expect(getDynamicGoalSettingKeys("scalar")).toEqual(["scalar.segments"]);
  });

  it("lists nothing for displays without dynamic goals, and for no display", () => {
    expect(getDynamicGoalSettingKeys("table")).toEqual([]);
    expect(getDynamicGoalSettingKeys(undefined)).toEqual([]);
  });

  it("only lists known goal settings", () => {
    getDynamicGoalSettingKeys("gauge").forEach((key) =>
      expect(Object.keys(GOAL_SETTINGS)).toContain(key),
    );
  });

  describe("when mocked for specs", () => {
    mockDynamicGoalSettingKeys(["graph.goal_value"]);

    it("answers the mocked keys for every display", () => {
      expect(getDynamicGoalSettingKeys("table")).toEqual(["graph.goal_value"]);
      expect(getDynamicGoalSettingKeys(undefined)).toEqual([
        "graph.goal_value",
      ]);
    });
  });

  it("is restored after a mocked describe", () => {
    expect(getDynamicGoalSettingKeys("table")).toEqual([]);
  });
});
