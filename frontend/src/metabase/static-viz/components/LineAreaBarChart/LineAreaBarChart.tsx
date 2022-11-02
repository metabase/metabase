import React from "react";
import { ColorGetter } from "metabase/static-viz/lib/colors";
import { isNotNull } from "metabase/core/utils/array";
import { getColorsForValues } from "metabase/lib/colors/charts";
import { formatStaticValue } from "metabase/static-viz/lib/format-static-value";
import { colors } from "metabase/lib/colors/palette";
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

  const minTickSize = chartStyle.axes.ticks.fontSize * 1.5;
  const xValuesCount = getXValuesCount(series);
  const chartSize = calculateChartSize(settings, xValuesCount, minTickSize);
  const adjustedSettings = adjustSettings(
    settings,
    xValuesCount,
    minTickSize,
    chartSize,
  );

  const keys = series
    .map(singleSeries => {
      if (singleSeries.seriesKey) {
        return singleSeries.seriesKey;
      }

      return formatStaticValue(singleSeries.name, {
        column: singleSeries.column,
      });
    })
    .filter(isNotNull);
  const palette = { ...colors, ...instanceColors };
  const chartColors = getColorsForValues(keys, undefined, palette);
  const seriesWithColors = series.map((singleSeries, index) => {
    return {
      ...singleSeries,
      color: chartColors[keys[index]],
    };
  });

  return (
    <XYChart
      series={seriesWithColors}
      settings={adjustedSettings}
      style={chartStyle}
      width={chartSize.width}
      height={chartSize.height}
    />
  );
};

export default LineAreaBarChart;
