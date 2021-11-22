import React from "react";
import { AxisBottom, AxisLeft, AxisRight } from "@visx/axis";
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
} from "../../lib/axes";
import {
  createXScale,
  createYScales,
  formatXTick,
  getYTickWidths,
} from "./utils";
import { formatNumber } from "metabase/static-viz/lib/numbers";
import { calculateMargin } from "./utils/margin";
import { getXTicksDimensions } from "./utils/ticks";
import { Legend } from "./legend/Legend";
import { CHART_PADDING } from "./constants";
import { calculateLegendItems } from "./utils/legend";

const layout = {
  width: 540,
  height: 300,
  font: {
    size: 11,
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
  maxTickWidth: 100,
};

export interface XYChartProps {
  width: number;
  height: number;
  series: Series[];
  settings: ChartSettings;
}

export const XYChart = ({ series, settings }: XYChartProps) => {
  const palette = { ...layout.colors };

  const yTickWidths = getYTickWidths(series, settings.y.format);
  const xTicksDimensions = getXTicksDimensions(
    series,
    settings.x,
    layout.font.size,
  );

  const yLabelOffsetLeft = yTickWidths.left + layout.labelPadding;
  const yLabelOffsetRight = layout.labelPadding;

  const margin = calculateMargin(
    yTickWidths.left,
    yTickWidths.right,
    xTicksDimensions.height,
    settings.labels,
    layout.font.size,
  );

  const innerWidth = layout.width - margin.left - margin.right;
  const innerHeight = layout.height - margin.top - margin.bottom;
  const xMin = margin.left;
  const xMax = xMin + innerWidth;
  const yMax = margin.top;
  const yMin = yMax + innerHeight;

  const xScale = createXScale(series, [0, innerWidth], settings.x.type);
  const { yScaleLeft, yScaleRight } = createYScales(
    series,
    [innerHeight, 0],
    settings.y.type,
  );

  const lines = series.filter(series => series.type === "line");
  const areas = series.filter(series => series.type === "area");
  const bars = series.filter(series => series.type === "bar");

  const defaultYScale = yScaleLeft || yScaleRight;

  const legendWidth = layout.width - 2 * CHART_PADDING;
  const legend = calculateLegendItems(series, legendWidth, 16);

  return (
    <svg width={layout.width} height={layout.height + legend.height}>
      <Group top={margin.top} left={xMin}>
        {defaultYScale && (
          <GridRows
            scale={defaultYScale}
            width={innerWidth}
            strokeDasharray="4"
          />
        )}

        <BarSeries
          series={bars}
          yScaleLeft={yScaleLeft}
          yScaleRight={yScaleRight}
          xAccessor={xScale.barAccessor!}
          bandwidth={xScale.bandwidth!}
        />
        <AreaSeries
          series={areas}
          yScaleLeft={yScaleLeft}
          yScaleRight={yScaleRight}
          xAccessor={xScale.lineAccessor}
        />
        <LineSeries
          series={lines}
          yScaleLeft={yScaleLeft}
          yScaleRight={yScaleRight}
          xAccessor={xScale.lineAccessor}
        />
      </Group>

      {yScaleLeft && (
        <AxisLeft
          hideTicks
          hideAxisLine
          label={settings.labels.left}
          labelOffset={yLabelOffsetLeft}
          top={margin.top}
          left={xMin}
          scale={yScaleLeft}
          stroke={palette.textLight}
          tickStroke={palette.textLight}
          labelProps={getLabelProps(layout) as any}
          tickFormat={value => formatNumber(value, settings.y.format)}
          tickLabelProps={() => getYTickLabelProps(layout) as any}
        />
      )}

      {yScaleRight && (
        <AxisRight
          hideTicks
          hideAxisLine
          label={settings.labels.right}
          labelOffset={yLabelOffsetRight}
          top={margin.top}
          left={xMax + yTickWidths.right}
          scale={yScaleRight}
          stroke={palette.textLight}
          tickStroke={palette.textLight}
          labelProps={getLabelProps(layout) as any}
          tickFormat={value => formatNumber(value, settings.y.format)}
          tickLabelProps={() => getYTickLabelProps(layout) as any}
        />
      )}

      <AxisBottom
        scale={xScale.scale}
        label={settings.labels.bottom}
        top={yMin}
        left={xMin}
        numTicks={layout.numTicks}
        stroke={palette.textLight}
        tickStroke={palette.textLight}
        labelProps={getLabelProps(layout) as any}
        tickFormat={value =>
          formatXTick(value.valueOf(), settings.x.type, settings.x.format)
        }
        tickLabelProps={() => getXTickLabelProps(layout) as any}
      />

      <Legend
        legend={legend}
        left={CHART_PADDING}
        top={layout.height}
        width={legendWidth}
      />
    </svg>
  );
};
