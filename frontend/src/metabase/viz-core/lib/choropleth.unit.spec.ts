import { checkNotNull } from "metabase/utils/types";
import { createMockSingleSeries } from "metabase-types/api/mocks";

import { REGION_MAP_LEGEND_SETTINGS } from "./choropleth";

describe("REGION_MAP_LEGEND_SETTINGS", () => {
  const setting = checkNotNull(REGION_MAP_LEGEND_SETTINGS["legend.is_visible"]);
  const getHidden = checkNotNull(setting.getHidden);
  const series = [createMockSingleSeries({ display: "map" })];

  it("should show the legend by default", () => {
    expect(setting.getDefault?.(series, {})).toBe(true);
  });

  it("should offer the toggle on region maps", () => {
    expect(getHidden(series, { "map.type": "region" })).toBe(false);
  });

  it.each(["pin", "grid", "heat"] as const)(
    "should hide the toggle on %s maps, which have no legend",
    (mapType) => {
      expect(getHidden(series, { "map.type": mapType })).toBe(true);
    },
  );
});
