import type { TickRendererProps } from "@visx/axis";
import { getTicks } from "@visx/scale";
import type { TimeInterval } from "d3-time";
import { timeWeek, timeMonth } from "d3-time";

import { MAX_ROTATED_TICK_WIDTH } from "metabase/static-viz/components/XYChart/constants";
import type {
  Series,
  XAxisType,
  XValue,
  XScale,
  ChartSettings,
} from "metabase/static-viz/components/XYChart/types";
import { getX } from "metabase/static-viz/components/XYChart/utils/series";
import type { DateFormatOptions } from "metabase/static-viz/lib/dates";
import { formatDate } from "metabase/static-viz/lib/dates";
import type { NumberFormatOptions } from "metabase/static-viz/lib/numbers";
import { formatNumber } from "metabase/static-viz/lib/numbers";
import {
  measureTextWidth,
  measureTextHeight,
  truncateText,
} from "metabase/static-viz/lib/text";
import type { ContinuousDomain } from "metabase/visualizations/shared/types/scale";

const getRotatedXTickHeight = (tickWidth: number) => {
  return tickWidth;
};

export const formatXTick = (
  value: XValue,
  xAxisType: XAxisType,
  formatSettings: ChartSettings["x"]["format"],
) => {
  if (xAxisType === "timeseries") {
    return formatDate(
      new Date(value as string),
      formatSettings as DateFormatOptions,
    );
  }

  if (xAxisType !== "ordinal") {
    return formatNumber(Number(value), formatSettings as NumberFormatOptions);
  }

  return value.toString();
};

export const getXTickWidthLimit = (
  settings: ChartSettings["x"],
  actualMaxWidth: number,
  bandwidth?: number,
) => {
  if (settings.tick_display === "hide") {
    return 0;
  }

  if (settings.type !== "ordinal" || !bandwidth) {
    return Infinity;
  }

  return settings.tick_display === "rotate-90"
    ? Math.min(actualMaxWidth, MAX_ROTATED_TICK_WIDTH)
    : bandwidth;
};

export const getXTicksDimensions = (
  series: Series[],
  settings: ChartSettings["x"],
  fontSize: number,
) => {
  if (settings.tick_display === "hide") {
    return {
      width: 0,
      height: 0,
      maxTextWidth: 0,
    };
  }

  const maxTextWidth = series
    .flatMap(s => s.data)
    .map(datum => {
      const tick = formatXTick(getX(datum), settings.type, settings.format);
      return measureTextWidth(tick.toString(), fontSize);
    })
    .reduce((a, b) => Math.max(a, b), 0);

  if (settings.tick_display === "rotate-90") {
    const rotatedSize = getRotatedXTickHeight(maxTextWidth);

    return {
      width: measureTextHeight(fontSize),
      height: Math.min(rotatedSize, MAX_ROTATED_TICK_WIDTH),
      maxTextWidth,
    };
  }

  return {
    width: Math.min(maxTextWidth, MAX_ROTATED_TICK_WIDTH),
    height: measureTextHeight(fontSize),
    maxTextWidth,
  };
};

export const getXTickProps = (
  { x, y, formattedValue, ...props }: TickRendererProps,
  tickFontSize: number,
  truncateToWidth: number,
  shouldRotate?: boolean,
): Omit<TickRendererProps, "formattedValue"> => {
  const value =
    truncateToWidth != null
      ? truncateText(formattedValue || "", truncateToWidth, tickFontSize)
      : formattedValue;

  const textBaseline = Math.floor(tickFontSize / 2);
  const transform = shouldRotate
    ? `rotate(-90, ${x} ${y}) translate(${textBaseline}, ${Math.floor(
        tickFontSize / 3,
      )})`
    : undefined;

  const textAnchor = shouldRotate ? "end" : "middle";

  return { x, y, ...props, transform, children: value, textAnchor };
};

export const getDistinctXValuesCount = (series: Series[]) =>
  new Set(series.flatMap(s => s.data).map(getX)).size;

export const calculateYTickWidth = (
  domain: ContinuousDomain,
  settings: ChartSettings["y"]["format"],
  fontSize: number,
) => {
  const domainValuesWidths = domain
    .map(value => formatNumber(value, settings))
    .map(formatted => measureTextWidth(formatted, fontSize));

  return Math.max(...domainValuesWidths);
};

export const getYTickWidths = (
  settings: ChartSettings["y"]["format"],
  fontSize: number,
  leftYDomain?: ContinuousDomain,
  rightYDomain?: ContinuousDomain,
) => {
  return {
    left:
      leftYDomain != null
        ? calculateYTickWidth(leftYDomain, settings, fontSize)
        : 0,
    right:
      rightYDomain != null
        ? calculateYTickWidth(rightYDomain, settings, fontSize)
        : 0,
  };
};

/**
 * The reason this function exists in the first place is because of
 * a bug in visx's `getTicks` function. It's supposed to ensure that
 * the result ticks array has a length less than or equal to `numTicks`,
 * but sometimes it returns an array with a length greater than `numTicks`.
 *
 * If this bug is fixed in visx, this function can be removed.
 */
export function fixTimeseriesTicksExceedXTickCount(
  xScaleType: XAxisType,
  xScale: XScale["scale"],
  numTicks: number,
) {
  const defaultTicks = getTicks(xScale, numTicks);

  if (xScaleType === "timeseries" && defaultTicks.length > numTicks) {
    let minLengthTicks = defaultTicks;
    const candidateTickIntervals = [
      timeWeek.every(2) as TimeInterval,
      timeMonth.every(2) as TimeInterval,
    ];
    candidateTickIntervals
      .map(tickInterval => getTicks(xScale, tickInterval as unknown as number))
      .filter(ticks => ticks.length > 0)
      .forEach(ticks => {
        if (ticks.length < minLengthTicks.length) {
          minLengthTicks = ticks;
        }
      });

    if (numTicks == null || minLengthTicks.length <= numTicks) {
      return minLengthTicks;
    }

    return minLengthTicks.filter(
      (_, index, ticks) => index % Math.ceil(ticks.length / numTicks) === 0,
    );
  }

  return defaultTicks;
}
