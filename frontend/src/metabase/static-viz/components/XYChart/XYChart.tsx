import React from "react";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { Group } from "@visx/group";
import { Series, ChartSettings } from "./types";
import { LineSeries } from "./shapes/LineSeries";
import { BarSeries } from "./shapes/BarSeries";
import { AreaSeries } from "./shapes/AreaSeries";

import {
  getLabelProps,
  getXTickLabelProps,
  getYTickLabelProps,
  getYTickWidth,
} from "../../lib/axes";
import { formatDate } from "../../lib/dates";
import { formatNumber } from "../../lib/numbers";
import { createXScale, createYScales, getY } from "./utils";

const layout = {
  width: 540,
  height: 300,
  margin: {
    top: 10,
    left: 55,
    right: 60,
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

interface XYChartProps {
  series: Series[];
  settings: ChartSettings;
}

export const XYChart = ({ series, settings }: XYChartProps) => {
  const palette = { ...layout.colors };
  const yTickWidth = getYTickWidth(
    series.flatMap(series => series.data),
    { y: getY },
    settings,
  );
  const yLabelOffset = yTickWidth + layout.labelPadding;

  const xMin = yLabelOffset + layout.font.size * 1.5;
  const xMax = layout.width - layout.margin.right;
  const yMin = layout.margin.top;
  const yMax = layout.height - layout.margin.bottom;
  const innerWidth = xMax - xMin;
  const innerHeight = yMax - yMin;

  const xScale = createXScale(series, [0, innerWidth]);
  const { yScaleLeft } = createYScales(
    series,
    [innerHeight, 0],
    settings.yAxisType,
  );

  const lines = series.filter(series => series.type === "line");
  const areas = series.filter(series => series.type === "area");
  const bars = series.filter(series => series.type === "bar");

  return (
    <svg width={layout.width} height={layout.height}>
      <Group top={layout.margin.top} left={xMin}>
        <GridRows scale={yScaleLeft} width={innerWidth} strokeDasharray="4" />

        <BarSeries
          series={bars}
          yScale={yScaleLeft}
          xScale={xScale}
          innerHeight={innerHeight}
        />
        <AreaSeries series={areas} yScale={yScaleLeft} xScale={xScale} />
        <LineSeries series={lines} yScale={yScaleLeft} xScale={xScale} />
      </Group>

      <AxisLeft
        hideTicks
        hideAxisLine
        label={settings.labels.left}
        labelOffset={yLabelOffset}
        top={layout.margin.top}
        left={xMin}
        scale={yScaleLeft}
        stroke={palette.textLight}
        tickStroke={palette.textLight}
        labelProps={getLabelProps(layout) as any}
        // TODO: format settings
        tickFormat={value => formatNumber(value, null)}
        tickLabelProps={() => getYTickLabelProps(layout) as any}
      />

      <AxisBottom
        scale={xScale}
        label={settings.labels.bottom}
        top={layout.height - layout.margin.bottom}
        left={xMin}
        numTicks={layout.numTicks}
        stroke={palette.textLight}
        tickStroke={palette.textLight}
        labelProps={getLabelProps(layout) as any}
        // TODO: format
        // tickFormat={value => formatDate(value, null)}
        tickLabelProps={() => getXTickLabelProps(layout) as any}
      />
    </svg>
  );
};
