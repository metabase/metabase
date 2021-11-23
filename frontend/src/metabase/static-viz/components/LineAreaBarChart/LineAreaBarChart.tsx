import React from "react";
import { XYChart } from "../XYChart";
import { ChartSettings, ChartStyle, Series } from "../XYChart/types";
import { Colors } from "./types";

const defaultColors = {
  brand: "#509ee3",
  brandLight: "#DDECFA",
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
  };

  return (
    <XYChart
      series={series}
      settings={settings}
      style={chartStyle}
      width={540}
      height={300}
    />
  );
};

export default LineAreaBarChart;
