import type { GoalSettingKey } from "metabase/viz-core/lib/dynamic-goal-settings";
import * as dynamicGoalSettings from "metabase/viz-core/lib/dynamic-goal-settings";
import type { VisualizationDisplay } from "metabase-types/api";

// "CARTESIAN" here means displays rendered with `CartesianChart` component
export const DYNAMIC_GOAL_CARTESIAN_DISPLAYS = [
  "line",
  "bar",
  "area",
  "combo",
  "scatter",
] as const satisfies readonly VisualizationDisplay[];

// Every display that resolves `graph.goal_value`
export const DYNAMIC_GOAL_DISPLAYS = [
  ...DYNAMIC_GOAL_CARTESIAN_DISPLAYS,
  "row",
] as const satisfies readonly VisualizationDisplay[];

/**
 * Makes every display resolve `keys` for the tests of the enclosing `describe`.
 * Temporary, until all cartesian charts support dynamic goals.
 */
export function mockDynamicGoalSettingKeys(keys: GoalSettingKey[]) {
  let spy: jest.SpyInstance;

  beforeEach(() => {
    spy = jest
      .spyOn(dynamicGoalSettings, "getDynamicGoalSettingKeys")
      .mockReturnValue(keys);
  });

  afterEach(() => {
    spy.mockRestore();
  });
}
