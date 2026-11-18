import { checkNotNull } from "metabase/utils/types";
import { createMockSingleSeries } from "metabase-types/api/mocks";

import { MAP_VIZ_DEFINITION } from "./definition";

describe("MAP_VIZ_DEFINITION legend.position", () => {
  const setting = checkNotNull(
    MAP_VIZ_DEFINITION.settings?.["legend.position"],
  );
  const getHidden = checkNotNull(setting.getHidden);
  const series = [createMockSingleSeries({ display: "map" })];

  it("should place the legend automatically by default", () => {
    expect(setting.getDefault?.(series, {})).toBe("auto");
  });

  it("should offer the setting on region maps", () => {
    expect(getHidden(series, { "map.type": "region" })).toBe(false);
  });

  it.each(["pin", "grid", "heat"] as const)(
    "should hide the setting on %s maps, which have no legend",
    (mapType) => {
      expect(getHidden(series, { "map.type": mapType })).toBe(true);
    },
  );
});
