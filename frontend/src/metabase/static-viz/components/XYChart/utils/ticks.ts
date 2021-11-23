import { TickRendererProps } from "@visx/axis";
import { getYTickWidth } from "metabase/static-viz/lib/axes";
import { formatDate } from "metabase/static-viz/lib/dates";
import { formatNumber } from "metabase/static-viz/lib/numbers";
import {
  measureText,
  measureTextHeight,
  truncateText,
} from "metabase/static-viz/lib/text";
import { MAX_ROTATED_TICK_WIDTH } from "metabase/static-viz/components/XYChart/constants";
import {
  ChartSettings,
  Series,
  XAxisType,
  XValue,
} from "metabase/static-viz/components/XYChart/types";
import {
  getX,
  getY,
} from "metabase/static-viz/components/XYChart/utils/series";

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

export const getXTickWidthLimit = (
  settings: ChartSettings["x"],
  actualMaxWidth: number,
  bandwidth?: number,
) => {
  if (settings.type !== "ordinal" || !bandwidth) {
    return Infinity;
  }

  return settings.tick_display === "rotate-45"
    ? Math.min(actualMaxWidth, MAX_ROTATED_TICK_WIDTH)
    : bandwidth;
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
      return measureText(tick, 8);
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

export const getXTickProps = (
  props: TickRendererProps,
  tickFontSize: number,
  truncateToWidth: number,
  shouldRotate?: boolean,
): TickRendererProps => {
  const value =
    truncateToWidth != null
      ? truncateText(props.formattedValue || "", truncateToWidth)
      : props.formattedValue;

  const textBaseline = Math.floor(tickFontSize / 2);
  const transform = shouldRotate
    ? `rotate(45, ${props.x} ${props.y}) translate(-${textBaseline} 0)`
    : undefined;

  const textAnchor = shouldRotate ? "start" : "middle";

  return { ...props, transform, children: value, textAnchor };
};

export const getDistinctXValuesCount = (series: Series[]) =>
  new Set(series.flatMap(s => s.data).map(getX)).size;

export const calculateYTickWidth = (
  series: Series[],
  settings: ChartSettings["y"]["format"],
) => {
  if (series.length === 0) {
    return 0;
  }

  return getYTickWidth(
    series.flatMap(series => series.data),
    { y: getY },
    settings,
  ) as number;
};

export const getYTickWidths = (
  series: Series[],
  settings: ChartSettings["y"]["format"],
) => {
  const leftScaleSeries = series.filter(
    series => series.yAxisPosition === "left",
  );
  const rightScaleSeries = series.filter(
    series => series.yAxisPosition === "right",
  );

  return {
    left: calculateYTickWidth(leftScaleSeries, settings),
    right: calculateYTickWidth(rightScaleSeries, settings),
  };
};
