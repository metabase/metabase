import { color } from "metabase/lib/colors";
import { colors } from "metabase/lib/colors/palette";
import { ColorGetter } from "metabase/static-viz/lib/colors";
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
  getColor: ColorGetter;
}

const LineAreaBarChart = ({
  series,
  settings,
  getColor,
}: LineAreaBarChartProps) => {
  const chartStyle: ChartStyle = {
    fontFamily: "Lato, sans-serif",
    axes: {
      color: getColor("text-light"),
      ticks: {
        color: getColor("text-medium"),
        fontSize: 11,
      },
      labels: {
        color: getColor("text-medium"),
        fontSize: 11,
        fontWeight: 700,
      },
    },
    legend: {
      fontSize: 13,
      lineHeight: 16,
    },
    value: {
      color: getColor("text-dark"),
      fontSize: 11,
      fontWeight: 800,
      stroke: getColor("white"),
      strokeWidth: 3,
    },
    goalColor: getColor("text-medium"),
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
