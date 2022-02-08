import React from "react";
import { XYChart } from "../XYChart";
import { ChartSettings, ChartStyle, Series } from "../XYChart/types";
import { Colors } from "./types";
import {
  adjustSettings,
  calculateChartSize,
  getXValuesCount,
} from "./utils/settings";

const defaultColors = {
  brand: "#509ee3",
  brandLight: "#ddecfa",
  textLight: "#b8bbc3",
  textMedium: "#949aab",
};

interface LineAreaBarChartProps {
  series: Series[];
  settings: ChartSettings;
  colors: Colors;
}

const LineAreaBarChart = ({
  series,
  settings,
  colors,
}: LineAreaBarChartProps) => {
  const palette = { ...defaultColors, ...colors };

  const chartStyle: ChartStyle = {
    fontFamily: "Lato, sans-serif",
    axes: {
      color: palette.textLight,
      ticks: {
        color: palette.textMedium,
        fontSize: 11,
      },
      labels: {
        color: palette.textMedium,
        fontSize: 11,
        fontWeight: 700,
      },
    },
    legend: {
      fontSize: 13,
      lineHeight: 16,
    },
    goalColor: palette.textMedium,
  };

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
