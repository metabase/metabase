import type { ComputedVisualizationSettings } from "../types";

import { getDashboardAdjustedSettings } from "./settings-adjustments";

const SETTINGS: ComputedVisualizationSettings = {
  "timeline_events.enabled": true,
};

const areTimelineEventsEnabled = (width: number, height: number) =>
  getDashboardAdjustedSettings({ settings: SETTINGS, width, height })[
    "timeline_events.enabled"
  ];

describe("getDashboardAdjustedSettings", () => {
  it("keeps timeline events on a card with room for them", () => {
    expect(areTimelineEventsEnabled(400, 300)).toBe(true);
  });

  it("turns timeline events off on a short card", () => {
    expect(areTimelineEventsEnabled(400, 200)).toBe(false);
  });

  it("turns timeline events off on a narrow card", () => {
    expect(areTimelineEventsEnabled(240, 300)).toBe(false);
  });
});
