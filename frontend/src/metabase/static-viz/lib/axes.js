import { formatNumber } from "./numbers";
import { measureTextWidth } from "./text";

export const getXTickWidth = (data, accessors, maxWidth, fontSize) => {
  return getXTickWidthFromValues(data.map(accessors.x), maxWidth, fontSize);
};

export const getXTickWidthFromValues = (values, maxWidth, fontSize) => {
  const tickWidth = values
    .map(tick => String(tick))
    .map(tick => measureTextWidth(tick, fontSize))
    .reduce((a, b) => Math.max(a, b), 0);

  return Math.min(tickWidth, maxWidth);
};

export const getYTickWidth = (data, accessors, settings, fontSize) => {
  return data
    .map(accessors.y)
    .map(tick => formatNumber(tick, settings?.y))
    .map(tick => measureTextWidth(tick, fontSize))
    .reduce((a, b) => Math.max(a, b), 0);
};

/**
 *
 * @param {import("../components/XYChart/types").ChartStyle} chartStyle
 * @param {boolean} isVertical
 */
export const getXTickLabelProps = (chartStyle, isVertical) => ({
  fontFamily: chartStyle.fontFamily,
  fontSize: chartStyle.axes.ticks.fontSize,
  fill: chartStyle.axes.ticks.color,
  textAnchor: isVertical ? "start" : "middle",
});

/**
 *
 * @param {import("../components/XYChart/types").ChartStyle} chartStyle
 */
export const getYTickLabelProps = chartStyle => ({
  fontFamily: chartStyle.fontFamily,
  fontSize: chartStyle.axes.ticks.fontSize,
  fill: chartStyle.axes.ticks.color,
  textAnchor: "end",
});

/**
 *
 * @param {import("../components/XYChart/types").ChartStyle} chartStyle
 */
export const getLabelProps = chartStyle => ({
  fontFamily: chartStyle.fontFamily,
  fontWeight: chartStyle.axes.labels.fontWeight,
  fontSize: chartStyle.axes.labels.fontSize,
  fill: chartStyle.axes.labels.color,
  textAnchor: "middle",
});
