import fetchMock from "fetch-mock";

import { mockDynamicGoalSettingKeys } from "__support__/dynamic-goals";
import { setupCardDataset } from "__support__/server-mocks";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import type { ComputedVisualizationSettings } from "metabase/viz-core";
import type { Card, DatasetData } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
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

function setup(
  card: Card,
  settings: ComputedVisualizationSettings,
  data: DatasetData = DATA,
) {
  return renderHookWithProviders(
    () => useResolvedGoalSettings(card, data, settings),
    {},
  );
}

describe("useResolvedGoalSettings", () => {
  it("returns the same settings object for a static goal", () => {
    const settings: ComputedVisualizationSettings = {
      "graph.goal_value": 10,
    };
    const { result } = setup(createMockCard({ display: "line" }), settings);

    expect(result.current).toEqual({ status: "resolved", settings });
    expect(result.current.settings).toBe(settings);
  });

  it("leaves a reference alone for a display that does not resolve graph goals", () => {
    const { result } = setup(
      createMockCard({ display: "scalar" }),
      REFERENCED_SETTINGS,
    );

    expect(result.current).toEqual({
      status: "resolved",
      settings: REFERENCED_SETTINGS,
    });
    expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(0);
  });

  describe("for a display that resolves graph goals", () => {
    const card = createMockCard({ display: "line" });

    mockDynamicGoalSettingKeys(["graph.goal_value"]);

    it("leaves a hidden goal line alone", () => {
      const settings = { ...REFERENCED_SETTINGS, "graph.show_goal": false };
      const { result } = setup(card, settings);

      expect(result.current).toEqual({ status: "resolved", settings });
      expect(result.current.settings).toBe(settings);
      expect(fetchMock.callHistory.calls("path:/api/dataset")).toHaveLength(0);
    });

    it("substitutes an answer the dataset already has", () => {
      const data = createMockDatasetData({
        ...DATA,
        referenced_entities: {
          card: {
            9: {
              status: "completed",
              data: {
                cols: [createMockColumn({ name: "goal" })],
                rows: [[250]],
              },
            },
          },
        },
      });

      const { result } = setup(card, REFERENCED_SETTINGS, data);

      expect(result.current).toEqual({
        status: "resolved",
        settings: { ...REFERENCED_SETTINGS, "graph.goal_value": 250 },
      });
    });

    it("resolves the reference by re-running the query", async () => {
      setupCardDataset({
        dataset: {
          data: createMockDatasetData({
            referenced_entities: {
              card: {
                9: {
                  status: "completed",
                  data: {
                    cols: [createMockColumn({ name: "goal" })],
                    rows: [[250]],
                  },
                },
              },
            },
          }),
        },
      });

      const { result } = setup(card, REFERENCED_SETTINGS);
      expect(result.current).toEqual({
        status: "resolving",
        settings: { ...REFERENCED_SETTINGS, "graph.goal_value": null },
      });

      await waitFor(() =>
        expect(result.current).toEqual({
          status: "resolved",
          settings: { ...REFERENCED_SETTINGS, "graph.goal_value": 250 },
        }),
      );
    });

    it("fails when the reference cannot be resolved", async () => {
      setupCardDataset({ status: 500 });

      const { result } = setup(card, REFERENCED_SETTINGS);

      await waitFor(() =>
        expect(result.current).toEqual({
          status: "failed",
          settings: { ...REFERENCED_SETTINGS, "graph.goal_value": null },
        }),
      );
    });
  });
});
