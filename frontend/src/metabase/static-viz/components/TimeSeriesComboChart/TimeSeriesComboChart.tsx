import React from "react";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { Group } from "@visx/group";
import { createTimeSeriesScales } from "./create-time-series-scales";
import { Colors, DateFormatSettings, Labels, NumberFormatSettings, Series } from "../types";
import { BarSeries } from "../shapes/BarSeries";
import { AreaSeries } from "../shapes/AreaSeries";
import { LineSeries } from "../shapes/LineSeries";
import { getChartBounds } from "../../lib/dimensions";

import {
  getLabelProps,
  getXTickLabelProps,
  getYTickLabelProps,
  getYTickWidth,
} from "../../lib/axes";
import { formatDate } from "../../lib/dates";
import { formatNumber } from "../../lib/numbers";
import { getY } from "../../lib/series";

const layout = {
  width: 540,
  height: 300,
  margin: {
    top: 10,
    left: 55,
    right: 40,
    bottom: 40,
  },
  font: {
    size: 11,
    family: "Lato, sans-serif",
  },
  colors: {
    brand: "#509ee3",
    brandLight: "#DDECFA",
    textLight: "#b8bbc3",
    textMedium: "#949aab",
  },
  numTicks: 5,
  strokeWidth: 2,
  labelFontWeight: 700,
  labelPadding: 12,
  areaOpacity: 0.2,
  strokeDasharray: "4",
};

interface TimeSeriesComboChartProps {
  series: Series<Date, number>[];
  settings: {
    x: DateFormatSettings;
    y: NumberFormatSettings;
    colors?: Colors;
  };
  labels: Labels;
}

const TimeSeriesComboChart = ({ series, settings, labels }: TimeSeriesComboChartProps) => {
  const palette = { ...layout.colors, ...settings?.colors };
  const dimensions = { width: layout.width, height: layout.height };
  const bounds = getChartBounds(dimensions, layout.margin);
  const yTickWidth = getYTickWidth(series.flatMap(series => series.data), { y: getY }, settings);
  const yLabelOffset = yTickWidth + layout.labelPadding;

  const { xScale, yScale } = createTimeSeriesScales(series, bounds);

  const lines = series.filter(series => series.settings.type === "line");
  const areas = series.filter(series => series.settings.type === "area");
  const bars = series.filter(series => series.settings.type === "bar");

  return (
    <svg width={layout.width} height={layout.width}>
      <GridRows
        scale={yScale}
        top={layout.margin.top}
        left={layout.margin.left}
        width={bounds.width}
        strokeDasharray="4"
      />

      <AxisLeft
        hideTicks
        hideAxisLine
        label={labels.left}
        labelOffset={yLabelOffset}
        top={layout.margin.top}
        left={layout.margin.left}
        scale={yScale}
        stroke={palette.textLight}
        tickStroke={palette.textLight}
        labelProps={getLabelProps(layout) as any}
        tickFormat={value => formatNumber(value, settings?.y)}
        tickLabelProps={() => getYTickLabelProps(layout) as any}
      />

      <AxisBottom
        scale={xScale}
        label={labels.bottom}
        top={layout.height - layout.margin.bottom}
        left={layout.margin.left}
        numTicks={layout.numTicks}
        stroke={palette.textLight}
        tickStroke={palette.textLight}
        labelProps={getLabelProps(layout) as any}
        tickFormat={value => formatDate(value, settings?.x)}
        tickLabelProps={() => getXTickLabelProps(layout) as any}
      />

      <Group top={layout.margin.top} left={layout.margin.left}>
        <BarSeries
          series={bars}
          yScale={yScale}
          xScale={xScale}
          innerHeight={bounds.height}
        />
        <AreaSeries series={areas} yScale={yScale} xScale={xScale} />
        <LineSeries series={lines} yScale={yScale} xScale={xScale} />
      </Group>
    </svg>
  );
};

export default TimeSeriesComboChart;
