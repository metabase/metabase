import fetchMock from "fetch-mock";

import { DYNAMIC_GOAL_DISPLAYS } from "__support__/dynamic-goals";
import { setupGoalSourceResultsEndpoint } from "__support__/server-mocks";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import type { ComputedVisualizationSettings } from "metabase/viz-core";
import type { VisualizationDisplay } from "metabase-types/api";
import {
  createMockColumn,
  createMockDatasetData,
  createMockFailedGoalSourceResults,
  createMockGoalSourceResults,
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

type SetupOpts = {
  display: VisualizationDisplay;
  settings: ComputedVisualizationSettings;
};

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
    expect(getGoalSourceCalls()).toHaveLength(0);
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
    expect(getGoalSourceCalls()).toHaveLength(0);
  });

  it("leaves a hidden goal line alone", () => {
    const settings = { ...REFERENCED_SETTINGS, "graph.show_goal": false };
    const { result } = setup({ display: "line", settings });

    expect(result.current).toEqual({
      status: "resolved",
      settings,
      errors: [],
    });
    expect(result.current.settings).toBe(settings);
    expect(getGoalSourceCalls()).toHaveLength(0);
  });

  it("hides the goal line while the goal source result loads, then substitutes it", async () => {
    setupGoalSourceResultsEndpoint(
      createMockGoalSourceResults({ column: "goal", value: 250 }),
    );

    const { result } = setup({
      display: "line",
      settings: REFERENCED_SETTINGS,
    });
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

  it("resolves the goal line of every display that draws one", async () => {
    setupGoalSourceResultsEndpoint(
      createMockGoalSourceResults({ column: "goal", value: 250 }),
    );

    for (const display of DYNAMIC_GOAL_DISPLAYS) {
      const { result, unmount } = setup({
        display,
        settings: REFERENCED_SETTINGS,
      });

      await waitFor(() =>
        expect(result.current.settings["graph.goal_value"]).toBe(250),
      );
      unmount();
    }
  });

  it("hides the goal line and reports the error when the goal source fails", async () => {
    setupGoalSourceResultsEndpoint(
      createMockFailedGoalSourceResults({ error: "boom" }),
    );

    const { result } = setup({
      display: "line",
      settings: REFERENCED_SETTINGS,
    });

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

  it("hides the goal line and reports the error when the request fails", async () => {
    setupGoalSourceResultsEndpoint(500);

    const { result } = setup({
      display: "line",
      settings: REFERENCED_SETTINGS,
    });

    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: "resolved",
        settings: HIDDEN_GOAL_SETTINGS,
        errors: [{ reason: "query-failed" }],
      }),
    );
  });
});

function getGoalSourceCalls() {
  return fetchMock.callHistory.calls("path:/api/dynamic-goal/values");
}
