import React from "react";
import { merge } from "icepick";
import { ColorGetter } from "metabase/static-viz/lib/colors";
import { colors } from "metabase/lib/colors";
import { XYChart } from "../XYChart";
import {
  ChartSettings,
  ChartStyle,
  SeriesWithOneOrLessDimensions,
  SeriesWithTwoDimensions,
} from "../XYChart/types";
import { Colors } from "./types";
import {
  adjustSettings,
  calculateChartSize,
  getXValuesCount,
} from "./utils/settings";
import { getSeriesWithColors, removeNoneSeriesFields } from "./utils/series";

interface LineAreaBarChartProps {
  multipleSeries: (SeriesWithOneOrLessDimensions | SeriesWithTwoDimensions)[][];
  multipleSettings: ChartSettings[];
  colors: Colors;
  getColor: ColorGetter;
}

const LineAreaBarChart = ({
  multipleSeries,
  multipleSettings,
  getColor,
  colors: instanceColors,
}: LineAreaBarChartProps) => {
  const chartStyle: ChartStyle = {
    fontFamily: "Lato, sans-serif",
    axes: {
      color: getColor("text-light"),
      ticks: {
        color: getColor("text-medium"),
        fontSize: 12,
      },
      labels: {
        color: getColor("text-medium"),
        fontSize: 14,
        fontWeight: 700,
      },
    },
    legend: {
      fontSize: 14,
      lineHeight: 20,
      fontWeight: 700,
    },
    value: {
      color: getColor("text-dark"),
      fontSize: 12,
      fontWeight: 800,
      stroke: getColor("white"),
      strokeWidth: 3,
    },
    goalColor: getColor("text-medium"),
  };

  const palette = { ...colors, ...instanceColors };
  const seriesWithColors = getSeriesWithColors(
    multipleSeries,
    multipleSettings[0],
    palette,
  ).map(series => merge(series, { name: series.name ?? series.cardName }));
  const series = removeNoneSeriesFields(seriesWithColors);

  const minTickSize = chartStyle.axes.ticks.fontSize * 1.5;
  const xValuesCount = getXValuesCount(series);
  const mainSettings = multipleSettings[0];
  const chartSize = calculateChartSize(mainSettings, xValuesCount, minTickSize);
  const adjustedSettings = adjustSettings(
    mainSettings,
    xValuesCount,
    minTickSize,
    chartSize,
  );

  return (
    <XYChart
      series={series}
      settings={adjustedSettings}
      style={chartStyle}
      width={chartSize.width}
      height={chartSize.height}
    />
  );
};

export default LineAreaBarChart;
