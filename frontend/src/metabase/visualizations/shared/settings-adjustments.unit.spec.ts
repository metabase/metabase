import type { ComputedVisualizationSettings } from "metabase/visualizations/types";

import { getDashboardAdjustedSettings } from "./settings-adjustments";

const settings: ComputedVisualizationSettings = {
  "timeline.events_enabled": true,
};

describe("getDashboardAdjustedSettings", () => {
  it("should disable timeline events on short dashcards", () => {
    const adjusted = getDashboardAdjustedSettings({
      settings,
      width: 500,
      height: 200,
    });
    expect(adjusted["timeline.events_enabled"]).toBe(false);
  });

  it("should disable timeline events on narrow dashcards", () => {
    const adjusted = getDashboardAdjustedSettings({
      settings,
      width: 240,
      height: 400,
    });
    expect(adjusted["timeline.events_enabled"]).toBe(false);
  });

  it("should keep timeline events on large dashcards", () => {
    const adjusted = getDashboardAdjustedSettings({
      settings,
      width: 500,
      height: 400,
    });
    expect(adjusted["timeline.events_enabled"]).toBe(true);
  });
});
