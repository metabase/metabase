import { TickRendererProps } from "@visx/axis";
import { formatDate, DateFormatOptions } from "metabase/static-viz/lib/dates";
import {
  formatNumber,
  NumberFormatOptions,
} from "metabase/static-viz/lib/numbers";
import {
  measureText,
  measureTextHeight,
  truncateText,
} from "metabase/static-viz/lib/text";
import { MAX_ROTATED_TICK_WIDTH } from "metabase/static-viz/components/XYChart/constants";
import {
  ChartSettings,
  ContiniousDomain,
  Series,
  XAxisType,
  XValue,
} from "metabase/static-viz/components/XYChart/types";
import { getX } from "metabase/static-viz/components/XYChart/utils/series";

export const getRotatedXTickHeight = (tickWidth: number) => {
  return Math.ceil(Math.sqrt(Math.pow(tickWidth, 2) / 2));
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
      return measureText(tick.toString(), fontSize);
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
      ? truncateText(props.formattedValue || "", truncateToWidth, tickFontSize)
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
  domain: ContiniousDomain,
  settings: ChartSettings["y"]["format"],
  fontSize: number,
) => {
  const domainValuesWidths = domain
    .map(value => formatNumber(value, settings))
    .map(formatted => measureText(formatted, fontSize));

  return Math.max(...domainValuesWidths);
};

export const getYTickWidths = (
  settings: ChartSettings["y"]["format"],
  fontSize: number,
  leftYDomain?: ContiniousDomain,
  rightYDomain?: ContiniousDomain,
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
