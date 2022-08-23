import { color } from "metabase/lib/colors";
import { colors } from "metabase/lib/colors/palette";
import React from "react";
import { XYChart } from "../XYChart";
import { ChartSettings, ChartStyle, Series } from "../XYChart/types";
import { Colors } from "./types";
import {
  adjustSettings,
  calculateChartSize,
  getXValuesCount,
} from "./utils/settings";

interface LineAreaBarChartProps {
  series: Series[];
  settings: ChartSettings;
  colors: Colors;
}

const LineAreaBarChart = ({
  series,
  settings,
  colors: instanceColors,
}: LineAreaBarChartProps) => {
  const palette = { ...colors, ...instanceColors };

  const chartStyle: ChartStyle = {
    fontFamily: "Lato, sans-serif",
    axes: {
      color: color("text-light", palette),
      ticks: {
        color: color("text-medium", palette),
        fontSize: 11,
      },
      labels: {
        color: color("text-medium", palette),
        fontSize: 11,
        fontWeight: 700,
      },
    },
    legend: {
      fontSize: 13,
      lineHeight: 16,
    },
    value: {
      color: color("text-dark", palette),
      fontSize: 11,
      fontWeight: 800,
    },
    goalColor: color("text-medium", palette),
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
