import fetchMock from "fetch-mock";

import { DYNAMIC_GOAL_DISPLAYS } from "__support__/dynamic-goals";
import { setupGoalValuesEndpoint } from "__support__/server-mocks";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import type { ComputedVisualizationSettings } from "metabase/viz-core";
import type { Card } from "metabase-types/api";
import {
  createMockColumn,
  createMockDatasetData,
  createMockFailedReferencedEntitiesResults,
  createMockReferencedEntitiesResults,
} from "metabase-types/api/mocks";

import { useResolvedGoalSettings } from "./use-resolved-goal-settings";

const DATA = createMockDatasetData({
  cols: [createMockColumn({ name: "count" })],
  rows: [[50]],
});

const REFERENCED_SETTINGS: ComputedVisualizationSettings = {
  "graph.show_goal": true,
  "graph.goal_value": { type: "card", id: 9, column: "goal" },
};

const HIDDEN_GOAL_SETTINGS: ComputedVisualizationSettings = {
  "graph.show_goal": false,
  "graph.goal_value": null,
};

interface SetupOpts {
  display: Card["display"];
  settings: ComputedVisualizationSettings;
}

function setup({ display, settings }: SetupOpts) {
  return renderHookWithProviders(
    () => useResolvedGoalSettings({ display }, DATA, settings),
    {},
  );
}

describe("useResolvedGoalSettings", () => {
  it("returns the same settings object for a static goal", () => {
    const settings: ComputedVisualizationSettings = {
      "graph.goal_value": 10,
    };
    const { result } = setup({ display: "line", settings });

    expect(result.current).toEqual({
      status: "resolved",
      settings,
      errors: [],
    });
    expect(result.current.settings).toBe(settings);
  });

  it("leaves a reference alone for a display that does not resolve graph goals", () => {
    const { result } = setup({
      display: "scalar",
      settings: REFERENCED_SETTINGS,
    });

    expect(result.current).toEqual({
      status: "resolved",
      settings: REFERENCED_SETTINGS,
      errors: [],
    });
    expect(getGoalValuesCalls()).toHaveLength(0);
  });

  describe.each(DYNAMIC_GOAL_DISPLAYS)("for a %s chart", (display) => {
    it("leaves a hidden goal line alone", () => {
      const settings = { ...REFERENCED_SETTINGS, "graph.show_goal": false };
      const { result } = setup({ display, settings });

      expect(result.current).toEqual({
        status: "resolved",
        settings,
        errors: [],
      });
      expect(result.current.settings).toBe(settings);
      expect(getGoalValuesCalls()).toHaveLength(0);
    });

    it("substitutes a self-column goal without fetching", () => {
      const settings = { ...REFERENCED_SETTINGS, "graph.goal_value": "count" };
      const { result } = setup({ display, settings });

      expect(result.current).toEqual({
        status: "resolved",
        settings: { ...settings, "graph.goal_value": 50 },
        errors: [],
      });
      expect(getGoalValuesCalls()).toHaveLength(0);
    });

    it("resolves the reference by fetching the value of its source", async () => {
      setupGoalValuesEndpoint(
        createMockReferencedEntitiesResults({ column: "goal", value: 250 }),
      );

      const { result } = setup({ display, settings: REFERENCED_SETTINGS });
      expect(result.current).toEqual({
        status: "resolving",
        settings: HIDDEN_GOAL_SETTINGS,
        errors: [],
      });

      await waitFor(() =>
        expect(result.current).toEqual({
          status: "resolved",
          settings: { ...REFERENCED_SETTINGS, "graph.goal_value": 250 },
          errors: [],
        }),
      );
    });

    it("hides the goal line and reports the error when fetching the value fails", async () => {
      setupGoalValuesEndpoint(() => new Response(null, { status: 500 }));

      const { result } = setup({ display, settings: REFERENCED_SETTINGS });

      await waitFor(() =>
        expect(result.current).toMatchObject({
          status: "resolved",
          settings: HIDDEN_GOAL_SETTINGS,
          errors: [{ reason: "query-failed" }],
        }),
      );
    });

    it("hides the goal line and reports the error for a source reported as failed", async () => {
      setupGoalValuesEndpoint(
        createMockFailedReferencedEntitiesResults({ error: "boom" }),
      );

      const { result } = setup({ display, settings: REFERENCED_SETTINGS });

      await waitFor(() =>
        expect(result.current).toEqual({
          status: "resolved",
          settings: HIDDEN_GOAL_SETTINGS,
          errors: [
            {
              type: "card",
              id: 9,
              column: "goal",
              reason: "query-failed",
              message: "boom",
            },
          ],
        }),
      );
    });
  });
});

function getGoalValuesCalls() {
  return fetchMock.callHistory.calls("path:/api/dynamic-goal/values");
}
