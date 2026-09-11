import type { GoalSettingKey } from "metabase/viz-core/lib/dynamic-goal-settings";
import * as dynamicGoalSettings from "metabase/viz-core/lib/dynamic-goal-settings";
import type { VisualizationDisplay } from "metabase-types/api";

/** The graph displays that resolve `graph.goal_value`; extend it as charts gain dynamic goals. */
export const DYNAMIC_GOAL_GRAPH_DISPLAYS = [
  "line",
  "bar",
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
