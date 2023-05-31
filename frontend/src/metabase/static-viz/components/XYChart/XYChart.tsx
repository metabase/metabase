import { Text, TextProps } from "@visx/text";
import { AxisBottom, AxisLeft, AxisRight } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { Group } from "@visx/group";
import { assoc } from "icepick";

import { formatNumber } from "metabase/static-viz/lib/numbers";
import { LineSeries } from "metabase/static-viz/components/XYChart/shapes/LineSeries";
import { BarSeries } from "metabase/static-viz/components/XYChart/shapes/BarSeries";
import { AreaSeries } from "metabase/static-viz/components/XYChart/shapes/AreaSeries";
import { Legend } from "metabase/static-viz/components/Legend";
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
  calculateStackedItems,
  fixTimeseriesTicksExceedXTickCount,
} from "metabase/static-viz/components/XYChart/utils";
import { GoalLine } from "metabase/static-viz/components/XYChart/GoalLine";
import { measureText } from "metabase/static-viz/lib/text";

import type {
  Series,
  ChartSettings,
  ChartStyle,
  HydratedSeries,
} from "metabase/static-viz/components/XYChart/types";
import Values from "../Values";
import { calculateLegendRows } from "../Legend/utils";

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

  const minValueSetting = settings.visualization_settings["graph.y_axis.min"];
  const maxValueSetting = settings.visualization_settings["graph.y_axis.max"];
  const yDomains = calculateYDomains(
    series,
    minValueSetting,
    maxValueSetting,
    settings.goal?.value,
  );
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
  const xTickVerticalMargins = style.axes.labels.fontSize * 2;

  const showValues = settings.visualization_settings["graph.show_values"];

  const margin = calculateMargin(
    yTickWidths.left,
    yTickWidths.right,
    xTicksDimensions.height + xTickVerticalMargins,
    xTicksDimensions.width,
    settings.labels,
    style.axes.ticks.fontSize,
    !!settings.goal || showValues,
  );

  const { xMin, xMax, yMin, innerHeight, innerWidth } = calculateBounds(
    margin,
    width,
    height,
  );
  const VALUE_CHAR_SIZE = measureText("0", style.value?.fontSize as number);
  const valuesLeftOffset = getValuesLeftOffset(
    settings,
    series,
    VALUE_CHAR_SIZE,
  );
  const calculatedInnerWidth = innerWidth - valuesLeftOffset;
  const xScale = createXScale(
    series,
    [0, calculatedInnerWidth],
    settings.x.type,
  );
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

  const legendRows = calculateLegendRows(
    series.map(series => ({ name: series.name, color: series.color })),
    width - CHART_PADDING * 2,
    style.legend.lineHeight,
    style.legend.fontSize,
    style.legend.fontWeight,
  );

  const legendHeight =
    legendRows != null ? legendRows.height + CHART_PADDING : 0;

  const xTickWidthLimit = getXTickWidthLimit(
    settings.x,
    xTicksDimensions.maxTextWidth,
    xScale.bandwidth,
  );
  const xTickCount = settings.x.type === "ordinal" ? Infinity : 4;

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

  const valueProps: Partial<TextProps> = {
    fontSize: style.value?.fontSize,
    fontFamily: style.fontFamily,
    fontWeight: style.value?.fontWeight,
    letterSpacing: 0.5,
    fill: style.value?.color,
    stroke: style.value?.stroke,
    strokeWidth: style.value?.strokeWidth,
  };

  const areXTicksRotated = settings.x.tick_display === "rotate-90";
  const areXTicksHidden = settings.x.tick_display === "hide";
  const xLabelOffset = areXTicksHidden ? -style.axes.ticks.fontSize : undefined;

  const tickValues = fixTimeseriesTicksExceedXTickCount(
    settings.x.type,
    xScale.scale,
    xTickCount,
  );

  return (
    <svg width={width} height={height + legendHeight}>
      {legendRows && (
        <Legend
          top={CHART_PADDING}
          left={CHART_PADDING}
          items={legendRows.items}
          fontSize={style.legend.fontSize}
          fontWeight={style.legend.fontWeight}
        />
      )}
      <Group top={legendHeight}>
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
            tickFormat={value =>
              formatNumber(value.valueOf(), settings.y.format)
            }
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
            tickFormat={value =>
              formatNumber(value.valueOf(), settings.y.format)
            }
            tickLabelProps={() => tickProps}
          />
        )}

        <Group left={valuesLeftOffset}>
          <Group top={margin.top} left={xMin}>
            {defaultYScale && (
              <GridRows
                scale={defaultYScale}
                width={calculatedInnerWidth}
                strokeDasharray="4"
              />
            )}
          </Group>

          <AxisBottom
            scale={xScale.scale}
            label={settings.labels.bottom}
            top={yMin}
            left={xMin}
            numTicks={xTickCount}
            labelOffset={xLabelOffset}
            stroke={style.axes.color}
            tickStroke={style.axes.color}
            hideTicks={settings.x.tick_display === "hide"}
            labelProps={{
              ...labelProps,
              transform: `translate(0, ${
                areXTicksRotated ? xTickWidthLimit : CHART_PADDING
              })`,
            }}
            tickValues={tickValues}
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

          <Group top={margin.top} left={xMin}>
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
                x2={calculatedInnerWidth}
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                y={defaultYScale!(settings.goal.value)}
                color={style.goalColor}
              />
            )}

            {showValues && (
              <Values
                series={series}
                formatter={(value: number, compact: boolean): string =>
                  formatNumber(
                    value,
                    maybeAssoc(settings.y.format, "compact", compact),
                  )
                }
                valueProps={valueProps}
                xScale={xScale}
                yScaleLeft={yScaleLeft}
                yScaleRight={yScaleRight}
                innerWidth={calculatedInnerWidth}
                areStacked={settings.stacking === "stack"}
                xAxisYPos={yMin - margin.top}
              />
            )}
          </Group>
        </Group>
      </Group>
    </svg>
  );
};

const maybeAssoc: typeof assoc = (collection, key, value) => {
  if (collection == null) {
    return collection;
  }

  return assoc(collection, key, value);
};

// The approximate number of maximum characters for values could be around 7
// because the values will be compact format when the average length of
// compact format is less than the average length of full format by 3 characters.
// https://github.com/metabase/metabase/blob/96e9febfb31d231e3ef08ae907fb42773e065ca5/frontend/src/metabase/static-viz/components/XYChart/Values/Values.tsx#L175
// e.g. 110,000 vs 100K = 4 !< 7 - 3 it will use full format in this case.
// So, we could estimate that 7 is the maximum number of characters for values.
// Then 3.5 is the half the length of the approximate maximum value.
const APPROXIMATE_MAX_VALUE_CHAR_LENGTH = 7;
const MAX_SERIES_LENGTH = 15;
function getValuesLeftOffset(
  settings: ChartSettings,
  multipleSeries: HydratedSeries[],
  valueCharSize: number,
) {
  const maxSeriesLength = Math.max(
    ...multipleSeries.map(series => series.data.length),
  );
  if (
    settings.visualization_settings["graph.show_values"] &&
    maxSeriesLength > MAX_SERIES_LENGTH
  ) {
    return valueCharSize * (APPROXIMATE_MAX_VALUE_CHAR_LENGTH / 2);
  }

  return 0;
}
