import React from "react";
import { Text, TextProps } from "@visx/text";
import { AxisBottom, AxisLeft, AxisRight } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { Group } from "@visx/group";

import { formatNumber } from "metabase/static-viz/lib/numbers";
import {
  Series,
  ChartSettings,
  ChartStyle,
} from "metabase/static-viz/components/XYChart/types";
import { LineSeries } from "metabase/static-viz/components/XYChart/shapes/LineSeries";
import { BarSeries } from "metabase/static-viz/components/XYChart/shapes/BarSeries";
import { AreaSeries } from "metabase/static-viz/components/XYChart/shapes/AreaSeries";
import { Legend } from "metabase/static-viz/components/XYChart/legend/Legend";
import {
  CHART_PADDING,
  LABEL_PADDING,
} from "metabase/static-viz/components/XYChart/constants";
import {
  createXScale,
  createYScales,
  formatXTick,
  getYTickWidths,
  getXTickProps,
  calculateMargin,
  getXTicksDimensions,
  getXTickWidthLimit,
  calculateLegendItems,
  calculateBounds,
} from "metabase/static-viz/components/XYChart/utils";

export interface XYChartProps {
  width: number;
  height: number;
  series: Series[];
  settings: ChartSettings;
  style: ChartStyle;
}

export const XYChart = ({
  width,
  height,
  series,
  settings,
  style,
}: XYChartProps) => {
  const yTickWidths = getYTickWidths(series, settings.y.format);
  const xTicksDimensions = getXTicksDimensions(
    series,
    settings.x,
    style.axes.ticks.fontSize,
  );

  const yLabelOffsetLeft = yTickWidths.left + LABEL_PADDING;
  const yLabelOffsetRight = LABEL_PADDING;

  const margin = calculateMargin(
    yTickWidths.left,
    yTickWidths.right,
    xTicksDimensions.height,
    settings.labels,
    style.axes.ticks.fontSize,
  );

  const { xMin, xMax, yMin, innerHeight, innerWidth } = calculateBounds(
    margin,
    width,
    height,
  );

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

  const legendWidth = width - 2 * CHART_PADDING;
  const legend = calculateLegendItems(series, legendWidth, 16);

  const xTickWidthLimit = getXTickWidthLimit(
    settings.x,
    xTicksDimensions.maxTextWidth,
    xScale.bandwidth,
  );
  const xTicksCount = settings.x.type === "ordinal" ? Infinity : 5;

  const labelProps: Partial<TextProps> = {
    fontWeight: style.axes.labels.fontWeight,
    fontSize: style.axes.labels.fontSize,
    fontFamily: style.fontFamily,
    fill: style.axes.labels.color,
    textAnchor: "middle",
  };

  const tickProps: Partial<TextProps> = {
    fontSize: style.axes.ticks.fontSize,
    fontFamily: style.fontFamily,
    fill: style.axes.ticks.color,
    textAnchor: "end",
  };

  return (
    <svg width={width} height={height + legend.height}>
      <Group top={margin.top} left={xMin}>
        {defaultYScale && (
          <GridRows
            scale={defaultYScale}
            width={innerWidth}
            strokeDasharray="4"
          />
        )}

        {xScale.barAccessor && xScale.bandwidth && (
          <BarSeries
            series={bars}
            yScaleLeft={yScaleLeft}
            yScaleRight={yScaleRight}
            xAccessor={xScale.barAccessor}
            bandwidth={xScale.bandwidth}
          />
        )}
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
          stroke={style.axes.color}
          tickStroke={style.axes.color}
          labelProps={labelProps}
          tickFormat={value => formatNumber(value, settings.y.format)}
          tickLabelProps={() => tickProps}
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
          stroke={style.axes.color}
          tickStroke={style.axes.color}
          labelProps={labelProps}
          tickFormat={value => formatNumber(value, settings.y.format)}
          tickLabelProps={() => tickProps}
        />
      )}

      <AxisBottom
        scale={xScale.scale}
        label={settings.labels.bottom}
        top={yMin}
        left={xMin}
        numTicks={xTicksCount}
        stroke={style.axes.color}
        tickStroke={style.axes.color}
        labelProps={labelProps}
        tickFormat={value =>
          formatXTick(value.valueOf(), settings.x.type, settings.x.format)
        }
        tickComponent={props => (
          <Text
            {...getXTickProps(
              props,
              style.axes.ticks.fontSize,
              xTickWidthLimit,
              settings.x.tick_display === "rotate-45",
            )}
          />
        )}
        tickLabelProps={() => tickProps}
      />

      <Legend
        legend={legend}
        left={CHART_PADDING}
        top={height}
        width={legendWidth}
      />
    </svg>
  );
};
