import { formatDate } from "metabase/static-viz/lib/dates";
import { formatNumber } from "metabase/static-viz/lib/numbers";
import { measureText, measureTextHeight } from "metabase/static-viz/lib/text";
import { ChartSettings, Series, XAxisType, XValue } from "../types";
import { getX } from "./series";

export const getRotatedXTickHeight = (tickWidth: number) => {
  return Math.ceil(Math.sqrt(Math.pow(tickWidth, 2) / 2));
};

export const formatXTick = (
  value: XValue,
  xAxisType: XAxisType,
  formatSettings: ChartSettings["x"]["format"],
) => {
  if (xAxisType === "timeseries") {
    return formatDate(new Date(value as string).valueOf(), formatSettings);
  }

  if (xAxisType !== "ordinal") {
    return formatNumber(value, formatSettings);
  }

  return value;
};

export const getXTicksDimensions = (
  series: Series[],
  settings: ChartSettings["x"],
  fontSize: number,
) => {
  const maxTextWidth = series
    .flatMap(s => s.data)
    .map(datum => {
      const tick = formatXTick(getX(datum), settings.type, settings.format);
      return measureText(tick);
    })
    .reduce((a, b) => Math.max(a, b), 0);

  if (settings.tick_display === "rotate-45") {
    const rotatedSize = getRotatedXTickHeight(maxTextWidth);

    return {
      width: rotatedSize,
      height: rotatedSize,
      maxTextWidth,
    };
  }

  return {
    height: measureTextHeight(fontSize),
    width: maxTextWidth,
    maxTextWidth,
  };
};
