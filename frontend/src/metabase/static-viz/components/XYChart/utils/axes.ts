import { TickRendererProps } from "@visx/axis";
import { getYTickWidth } from "metabase/static-viz/lib/axes";
import { truncateText } from "metabase/static-viz/lib/text";
import { formatDate } from "../../../lib/dates";
import { formatNumber } from "../../../lib/numbers";
import { ChartSettings, Series, XAxisType, XValue } from "../types";
import { getX, getY } from "./seriesAccessors";

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

type GetOrdinalXTickPropsInput = {
  props: TickRendererProps;
  tickFontSize: number;
  xScaleBandwidth: number;
  xTickWidth: number;
  shouldRotate: boolean;
};

export const getOrdinalXTickProps = ({
  props,
  tickFontSize,
  xScaleBandwidth,
  xTickWidth,
  shouldRotate,
}: GetOrdinalXTickPropsInput) => {
  const textBaseline = Math.floor(tickFontSize / 2);

  const textWidth = shouldRotate ? xTickWidth : xScaleBandwidth;
  const truncatedText = truncateText(props.formattedValue || "", textWidth);
  const transform = shouldRotate
    ? `rotate(45, ${props.x} ${props.y}) translate(-${textBaseline} 0)`
    : undefined;

  return { ...props, transform, children: truncatedText };
};

export const getDistinctXValuesCount = (series: Series[]) =>
  new Set(series.flatMap(s => s.data).map(getX)).size;

export const shouldRotateXTicks = (
  distinctValuesCount: number,
  xAxisType: XAxisType,
) => {
  if (xAxisType !== "ordinal") {
    return false;
  }

  return distinctValuesCount > 10;
};

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
  );
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
