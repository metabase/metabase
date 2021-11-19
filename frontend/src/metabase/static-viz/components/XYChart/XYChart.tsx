import React from "react";
import { Text } from "@visx/text";
import { AxisBottom, AxisLeft, AxisRight, TickRendererProps } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { Group } from "@visx/group";
import { Series, ChartSettings } from "./types";
import { LineSeries } from "./shapes/LineSeries";
import { BarSeries } from "./shapes/BarSeries";
import { AreaSeries } from "./shapes/AreaSeries";

import {
  getLabelProps,
  getRotatedXTickHeight,
  getXTickLabelProps,
  getXTickWidthFromValues,
  getYTickLabelProps,
} from "../../lib/axes";
import {
  createXScale,
  createYScales,
  formatXTick,
  getOrdinalXTickProps,
  getX,
  shouldRotateXTicks,
  getDistinctXValuesCount,
  getYTickWidths,
} from "./utils";
import { formatNumber } from "metabase/static-viz/lib/numbers";
import { calculateBounds } from "./utils/bounds";

const layout = {
  width: 540,
  height: 300,
  margin: {
    top: 10,
    left: 10,
    right: 10,
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
  maxTickWidth: 100,
};

interface XYChartProps {
  series: Series[];
  settings: ChartSettings;
}

export const XYChart = ({ series, settings }: XYChartProps) => {
  const palette = { ...layout.colors };

  const yTickWidths = getYTickWidths(series, settings.y.format);

  const yLabelOffsetLeft = yTickWidths.left + layout.labelPadding;
  const yLabelOffsetRight = yTickWidths.right + layout.labelPadding;

  const distinctXValuesCount = getDistinctXValuesCount(series);
  const areXTicksRotated = shouldRotateXTicks(
    distinctXValuesCount,
    settings.x.type,
  );

  const xTickWidth = getXTickWidthFromValues(
    series.flatMap(s => s.data).map(getX),
    layout.maxTickWidth,
  );
  const xTicksHeight = areXTicksRotated ? getRotatedXTickHeight(xTickWidth) : 0;

  const { xMin, yMin, xMax, innerWidth, innerHeight } = calculateBounds({
    width: layout.width,
    height: layout.height,
    labelFontSize: layout.font.size,
    margin: layout.margin,
    yLabelOffsetLeft,
    yLabelOffsetRight,
    xTicksHeight,
  });

  const xScale = createXScale(series, [0, innerWidth]);
  const { yScaleLeft, yScaleRight } = createYScales(
    series,
    [innerHeight, 0],
    settings.y.type,
  );

  const lines = series.filter(series => series.type === "line");
  const areas = series.filter(series => series.type === "area");
  const bars = series.filter(series => series.type === "bar");

  const defaultYScale = yScaleLeft || yScaleRight;

  const isOrdinal = settings.x.type === "ordinal";

  const XTickComponent = isOrdinal
    ? (props: TickRendererProps) => (
        <Text
          {...getOrdinalXTickProps({
            props,
            tickFontSize: layout.font.size,
            xScaleBandwidth: xScale.bandwidth(),
            shouldRotate: areXTicksRotated,
            xTickWidth,
          })}
        />
      )
    : undefined;

  return (
    <svg width={layout.width} height={layout.height}>
      <Group top={layout.margin.top} left={xMin}>
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
          xScale={xScale}
        />
        <AreaSeries
          series={areas}
          yScaleLeft={yScaleLeft}
          yScaleRight={yScaleRight}
          xScale={xScale}
        />
        <LineSeries
          series={lines}
          yScaleLeft={yScaleLeft}
          yScaleRight={yScaleRight}
          xScale={xScale}
        />
      </Group>

      {yScaleLeft && (
        <AxisLeft
          hideTicks
          hideAxisLine
          label={settings.labels.left}
          labelOffset={yLabelOffsetLeft}
          top={layout.margin.top}
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
          labelOffset={yLabelOffsetRight - layout.font.size * 1.5}
          top={layout.margin.top}
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
        scale={xScale}
        label={areXTicksRotated ? undefined : settings.labels.bottom}
        top={yMin}
        left={xMin}
        numTicks={areXTicksRotated ? distinctXValuesCount : layout.numTicks}
        stroke={palette.textLight}
        tickStroke={palette.textLight}
        labelProps={getLabelProps(layout) as any}
        tickComponent={XTickComponent}
        tickFormat={value =>
          formatXTick(value, settings.x.type, settings.x.format)
        }
        tickLabelProps={() =>
          getXTickLabelProps(layout, areXTicksRotated) as any
        }
      />
    </svg>
  );
};
