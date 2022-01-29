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
  HydratedSeries,
} from "metabase/static-viz/components/XYChart/types";
import { LineSeries } from "metabase/static-viz/components/XYChart/shapes/LineSeries";
import { BarSeries } from "metabase/static-viz/components/XYChart/shapes/BarSeries";
import { AreaSeries } from "metabase/static-viz/components/XYChart/shapes/AreaSeries";
import { Legend } from "metabase/static-viz/components/XYChart/Legend";
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
  calculateBounds,
  calculateYDomains,
  sortSeries,
  getLegendColumns,
  calculateStackedItems,
} from "metabase/static-viz/components/XYChart/utils";
import { GoalLine } from "metabase/static-viz/components/XYChart/GoalLine";

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
  series: originalSeries,
  settings,
  style,
}: XYChartProps) => {
  let series: HydratedSeries[] = sortSeries(originalSeries, settings.x.type);

  if (settings.stacking === "stack") {
    series = calculateStackedItems(series);
  }

  const yDomains = calculateYDomains(series, settings.goal?.value);
  const yTickWidths = getYTickWidths(
    settings.y.format,
    style.axes.ticks.fontSize,
    yDomains.left,
    yDomains.right,
  );
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
    xTicksDimensions.width,
    settings.labels,
    style.axes.ticks.fontSize,
    !!settings.goal,
  );

  const { xMin, xMax, yMin, innerHeight, innerWidth } = calculateBounds(
    margin,
    width,
    height,
  );

  const xScale = createXScale(series, [0, innerWidth], settings.x.type);
  const { yScaleLeft, yScaleRight } = createYScales(
    [innerHeight, 0],
    settings.y.type,
    yDomains.left,
    yDomains.right,
  );

  const lines = series.filter(series => series.type === "line");
  const areas = series.filter(series => series.type === "area");
  const bars = series.filter(series => series.type === "bar");

  const defaultYScale = yScaleLeft || yScaleRight;

  const { leftColumn, rightColumn } = getLegendColumns(series);
  const legendHeight =
    Math.max(leftColumn.length, rightColumn.length) * style.legend.lineHeight;

  const xTickWidthLimit = getXTickWidthLimit(
    settings.x,
    xTicksDimensions.maxTextWidth,
    xScale.bandwidth,
  );
  const xTicksCount = settings.x.type === "ordinal" ? Infinity : 4;

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

  const areXTicksRotated = settings.x.tick_display === "rotate-45";
  const areXTicksHidden = settings.x.tick_display === "hide";
  const xLabelOffset = areXTicksHidden ? -style.axes.ticks.fontSize : undefined;

  return (
    <svg width={width} height={height + legendHeight}>
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
          areStacked={settings.stacking === "stack"}
        />
        <LineSeries
          series={lines}
          yScaleLeft={yScaleLeft}
          yScaleRight={yScaleRight}
          xAccessor={xScale.lineAccessor}
        />

        {settings.goal && (
          <GoalLine
            label={settings.goal.label}
            x1={0}
            x2={innerWidth}
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            y={defaultYScale!(settings.goal.value)}
            color={style.goalColor}
          />
        )}
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
          tickFormat={value => formatNumber(value.valueOf(), settings.y.format)}
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
          tickFormat={value => formatNumber(value.valueOf(), settings.y.format)}
          tickLabelProps={() => tickProps}
        />
      )}

      <AxisBottom
        scale={xScale.scale}
        label={areXTicksRotated ? undefined : settings.labels.bottom}
        top={yMin}
        left={xMin}
        numTicks={xTicksCount}
        labelOffset={xLabelOffset}
        stroke={style.axes.color}
        tickStroke={style.axes.color}
        hideTicks={settings.x.tick_display === "hide"}
        labelProps={labelProps}
        tickFormat={value =>
          formatXTick(value.valueOf(), settings.x.type, settings.x.format)
        }
        tickComponent={props =>
          areXTicksHidden ? null : (
            <Text
              {...getXTickProps(
                props,
                style.axes.ticks.fontSize,
                xTickWidthLimit,
                areXTicksRotated,
              )}
            />
          )
        }
        tickLabelProps={() => tickProps}
      />

      <Legend
        leftColumn={leftColumn}
        rightColumn={rightColumn}
        padding={CHART_PADDING}
        top={height}
        width={width}
        lineHeight={style.legend.lineHeight}
        fontSize={style.legend.fontSize}
      />
    </svg>
  );
};
