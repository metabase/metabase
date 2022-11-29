import React from "react";
import { ColorGetter } from "metabase/static-viz/lib/colors";
import { XYChart } from "../XYChart";
import { CardSeries, ChartSettings, ChartStyle } from "../XYChart/types";
import { Colors } from "./types";
import {
  adjustSettings,
  calculateChartSize,
  getXValuesCount,
} from "./utils/settings";
import {
  getSeriesWithColors,
  getSeriesWithLegends,
  removeNoneSeriesFields,
} from "./utils/series";

interface LineAreaBarChartProps {
  multipleSeries: CardSeries[];
  settings: ChartSettings;
  colors: Colors;
  getColor: ColorGetter;
}

const LineAreaBarChart = ({
  multipleSeries,
  settings,
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

  const seriesWithColors = getSeriesWithColors(
    multipleSeries,
    settings,
    instanceColors,
  );
  const seriesWithLegends = getSeriesWithLegends(seriesWithColors, settings);
  const series = removeNoneSeriesFields(seriesWithLegends);

  const minTickSize = chartStyle.axes.ticks.fontSize * 1.5;
  const xValuesCount = getXValuesCount(series);
  const chartSize = calculateChartSize(settings, xValuesCount, minTickSize);
  const adjustedSettings = adjustSettings(
    settings,
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
