import { assocIn } from "icepick";
import { ChartSettings, Series } from "../../XYChart/types";
import { getX } from "../../XYChart/utils";

// We want to adjust display settings based on chart data to achieve better-looking charts on smaller static images.
export const adjustSettings = (settings: ChartSettings, series: Series[]) => {
  return rotateCrowdedOrdinalXTicks(settings, series);
};

const rotateCrowdedOrdinalXTicks = (
  settings: ChartSettings,
  series: Series[],
) => {
  if (settings.x.type !== "ordinal") {
    return settings;
  }

  const items = new Set();
  series.forEach(s => {
    s.data.forEach(datum => items.add(getX(datum)));
  });

  return items.size > 10
    ? assocIn(settings, ["x", "tick_display"], "rotate-45")
    : settings;
};
