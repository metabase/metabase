import React from "react";
import _ from "underscore";
import { ColorGetter } from "metabase/static-viz/lib/colors";
import { isNotNull } from "metabase/core/utils/array";
import { getColorsForValues } from "metabase/lib/colors/charts";
import { formatStaticValue } from "metabase/static-viz/lib/format-static-value";
import { colors } from "metabase/lib/colors/palette";
import { XYChart } from "../XYChart";
import {
  ChartSettings,
  ChartStyle,
  Series,
  SeriesWithBreakoutValues,
} from "../XYChart/types";
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
  series: multipleSeries,
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
  const xValuesCount = getXValuesCount(multipleSeries);
  const chartSize = calculateChartSize(settings, xValuesCount, minTickSize);
  const adjustedSettings = adjustSettings(
    settings,
    xValuesCount,
    minTickSize,
    chartSize,
  );

  const keys = multipleSeries
    .map(series => {
      if (hasBreakoutValues(series)) {
        return formatStaticValue(series.name, {
          column: series.column,
        });
      }

      return series.seriesKey;
    })
    .filter(isNotNull);
  const palette = { ...colors, ...instanceColors };
  const seriesColors = settings.series_settings
    ? _.mapObject(settings.series_settings, value => {
        return value.color;
      })
    : undefined;
  const chartColors = getColorsForValues(keys, seriesColors, palette);
  const seriesWithColors = multipleSeries.map((singleSeries, index) => {
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

function hasBreakoutValues(series: Series): series is SeriesWithBreakoutValues {
  return Boolean((series as SeriesWithBreakoutValues).column);
}

export default LineAreaBarChart;
