import type { ComputedVisualizationSettings } from "metabase/viz-core";
import type { DatasetData } from "metabase-types/api";
import {
  createMockColumn,
  createMockDatasetData,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { resolveGoalSettingsForStaticViz } from "./dynamic-goals";

jest.mock("metabase/viz-core/lib/dynamic-goal-settings", () => ({
  getDynamicGoalSettingKeys: jest.fn(
    jest.requireActual("metabase/viz-core/lib/dynamic-goal-settings")
      .getDynamicGoalSettingKeys,
  ),
}));

const getDynamicGoalSettingKeysMock: jest.Mock = jest.requireMock(
  "metabase/viz-core/lib/dynamic-goal-settings",
).getDynamicGoalSettingKeys;

function resolveGraphGoals() {
  getDynamicGoalSettingKeysMock.mockReturnValue(["graph.goal_value"]);
}

function restoreDynamicGoalDisplays() {
  getDynamicGoalSettingKeysMock.mockReset();
  getDynamicGoalSettingKeysMock.mockImplementation(
    jest.requireActual("metabase/viz-core/lib/dynamic-goal-settings")
      .getDynamicGoalSettingKeys,
  );
}

const REFERENCED_SETTINGS: ComputedVisualizationSettings = {
  "graph.show_goal": true,
  "graph.goal_value": { type: "card", id: 9, column: "goal" },
};

function series(data: DatasetData) {
  return createMockSingleSeries({ display: "line" }, { data });
}

function data(referenced_entities: DatasetData["referenced_entities"]) {
  return createMockDatasetData({
    cols: [createMockColumn({ name: "count" })],
    rows: [[1]],
    referenced_entities,
  });
}

describe("resolveGoalSettingsForStaticViz", () => {
  it("passes static and unset goals through", () => {
    const settings = { "graph.goal_value": 10 };

    expect(resolveGoalSettingsForStaticViz(series(data({})), settings)).toBe(
      settings,
    );
    expect(resolveGoalSettingsForStaticViz(series(data({})), {})).toEqual({});
  });

  it("passes references through for a display that does not resolve graph goals", () => {
    expect(
      resolveGoalSettingsForStaticViz(series(data({})), REFERENCED_SETTINGS),
    ).toBe(REFERENCED_SETTINGS);
  });

  describe("for a display that resolves graph goals", () => {
    beforeEach(resolveGraphGoals);
    afterEach(restoreDynamicGoalDisplays);

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
        resolveGoalSettingsForStaticViz(series(answered), REFERENCED_SETTINGS),
      ).toEqual({ ...REFERENCED_SETTINGS, "graph.goal_value": 250 });
    });

    it("throws for an unanswered reference", () => {
      expect(() =>
        resolveGoalSettingsForStaticViz(series(data({})), REFERENCED_SETTINGS),
      ).toThrow("Couldn't load the value this chart's goal line depends on.");
    });

    it("throws for a failed reference", () => {
      const failed = data({ card: { 9: { status: "failed", error: "boom" } } });

      expect(() =>
        resolveGoalSettingsForStaticViz(series(failed), REFERENCED_SETTINGS),
      ).toThrow("Couldn't load the value this chart's goal line depends on.");
    });
  });
});
