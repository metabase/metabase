import type { GoalSettingKey } from "metabase/viz-core/lib/dynamic-goal-settings";
import * as dynamicGoalSettings from "metabase/viz-core/lib/dynamic-goal-settings";

/**
 * Makes every display resolve `keys` for the tests of the enclosing `describe`.
 * No display resolves `graph.goal_value` yet, so its resolution paths can only
 * be exercised this way.
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
