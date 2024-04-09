import { assocIn } from "icepick";

import type { ChartSettings, Series } from "../../XYChart/types";
import { getX } from "../../XYChart/utils";
import type { Size } from "../types";

const DEFAULT_SIZE = {
  width: 540,
  height: 300,
};

const RATIO = DEFAULT_SIZE.width / DEFAULT_SIZE.height;

const MAX_WIDTH = 800;

export const calculateChartSize = (
  settings: ChartSettings,
  xValuesCount: number,
  minTickSize: number,
): Size => {
  if (settings.x.type !== "ordinal") {
    return DEFAULT_SIZE;
  }

  const requiredWidth = minTickSize * xValuesCount;

  const width = Math.max(
    DEFAULT_SIZE.width,
    Math.min(MAX_WIDTH, requiredWidth),
  );
  const height = width / RATIO;

  return {
    width,
    height,
  };
};

export const getXValuesCount = (series: Series[]): number => {
  const items = new Set();
  series.forEach(s => {
    s.data.forEach(datum => items.add(getX(datum)));
  });
  return items.size;
};

// We want to adjust display settings based on chart data to achieve better-looking charts on smaller static images.
export const adjustSettings = (
  settings: ChartSettings,
  xValuesCount: number,
  minTickSize: number,
  chartSize: Size,
): ChartSettings => {
  return handleCrowdedOrdinalXTicks(
    settings,
    xValuesCount,
    minTickSize,
    chartSize,
  );
};

const handleCrowdedOrdinalXTicks = (
  settings: ChartSettings,
  xValuesCount: number,
  minTickSize: number,
  chartSize: Size,
) => {
  if (settings.x.type !== "ordinal") {
    return settings;
  }

  if (minTickSize * xValuesCount > chartSize.width) {
    return assocIn(settings, ["x", "tick_display"], "hide");
  }

  return xValuesCount > 10
    ? assocIn(settings, ["x", "tick_display"], "rotate-90")
    : settings;
};
