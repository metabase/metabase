import type { ComputedVisualizationSettings } from "metabase/visualizations/types";

import { getDashboardAdjustedSettings } from "./settings-adjustments";

const settings: ComputedVisualizationSettings = {
  "timeline.selected_timeline_ids": [1, 2],
};

describe("getDashboardAdjustedSettings", () => {
  it("should strip selected timelines on short dashcards", () => {
    const adjusted = getDashboardAdjustedSettings({
      settings,
      width: 500,
      height: 200,
    });
    expect(adjusted["timeline.selected_timeline_ids"]).toEqual([]);
  });

  it("should strip selected timelines on narrow dashcards", () => {
    const adjusted = getDashboardAdjustedSettings({
      settings,
      width: 240,
      height: 400,
    });
    expect(adjusted["timeline.selected_timeline_ids"]).toEqual([]);
  });

  it("should keep selected timelines on large dashcards", () => {
    const adjusted = getDashboardAdjustedSettings({
      settings,
      width: 500,
      height: 400,
    });
    expect(adjusted["timeline.selected_timeline_ids"]).toEqual([1, 2]);
  });
});
