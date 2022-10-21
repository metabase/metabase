import React from "react";
import { Group } from "@visx/group";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { Bar } from "@visx/shape";
import type { NumberValue, ScaleBand, ScaleContinuousNumeric } from "d3-scale";
import { Text } from "@visx/text";
import { GridColumns } from "@visx/grid";
import { scaleBand } from "@visx/scale";
import { HoveredData } from "metabase/visualizations/shared/types/events";
import { Margin } from "metabase/visualizations/shared/types/layout";
import { VerticalGoalLine } from "../VerticalGoalLine/VerticalGoalLine";
import { RowChartTheme, SeriesData } from "../RowChart/types";
import { DATA_LABEL_OFFSET } from "./constants";

export interface RowChartViewProps {
  width: number;
  height: number;
  yScale: ScaleBand<string>;
  xScale: ScaleContinuousNumeric<number, number, never>;
  seriesData: SeriesData<unknown>[];
  labelsFormatter: (value: NumberValue) => string;
  yTickFormatter: (value: string | number) => string;
  xTickFormatter: (value: NumberValue) => string;
  goal: {
    label: string;
    value: number;
    position: "left" | "right";
  } | null;
  theme: RowChartTheme;
  margin: Margin;
  innerWidth: number;
  innerHeight: number;
  xTicks: number[];
  shouldShowDataLabels?: boolean;
  xLabel?: string | null;
  yLabel?: string | null;
  isStacked?: boolean;
  style?: React.CSSProperties;
  hoveredData?: HoveredData | null;
  onHover?: (
    event: React.MouseEvent,
    seriesIndex: number | null,
    datumIndex: number | null,
  ) => void;
  onClick?: (
    event: React.MouseEvent,
    seriesIndex: number,
    datumIndex: number,
  ) => void;
}

export const RowChartView = ({
  width,
  height,
  innerHeight,
  xScale,
  yScale,
  seriesData,
  goal,
  theme,
  margin,
  labelsFormatter,
  yTickFormatter,
  xTickFormatter,
  xTicks,
  shouldShowDataLabels,
  yLabel,
  xLabel,
  isStacked,
  style,
  hoveredData,
  onHover,
  onClick,
}: RowChartViewProps) => {
  const handleBarMouseEnter = (
    event: React.MouseEvent,
    seriesIndex: number,
    datumIndex: number,
  ) => {
    onHover?.(event, seriesIndex, datumIndex);
  };

  const handleBarMouseLeave = (event: React.MouseEvent) => {
    onHover?.(event, null, null);
  };

  const handleClick = (
    event: React.MouseEvent,
    seriesIndex: number,
    datumIndex: number,
  ) => {
    onClick?.(event, seriesIndex, datumIndex);
  };

  const innerBarScale = isStacked
    ? null
    : scaleBand({
        domain: seriesData.map((_, index) => index),
        range: [0, yScale.bandwidth()],
      });

  const goalLineX = xScale(goal?.value ?? 0);

  return (
    <svg width={width} height={height} style={style}>
      <Group top={margin.top} left={margin.left}>
        <GridColumns
          scale={xScale}
          height={innerHeight}
          stroke={theme.grid.color}
          tickValues={xTicks}
        />

        {seriesData.map((series, seriesIndex) => {
          return series.bars.map(bar => {
            const {
              xStartValue,
              xEndValue,
              isNegative,
              yValue,
              datumIndex,
              isBorderValue,
            } = bar;

            let y = yScale(yValue);

            if (y == null) {
              return null;
            }

            y += innerBarScale?.(seriesIndex) ?? 0;

            const x = xScale(xStartValue);
            const width = xScale(xEndValue) - x;

            const hasSeriesHover = hoveredData != null;
            const isSeriesHovered = hoveredData?.seriesIndex === seriesIndex;
            const isDatumHovered = hoveredData?.datumIndex === datumIndex;

            const shouldHighlightBar =
              seriesData.length === 1 && isDatumHovered;
            const shouldHighlightSeries =
              seriesData.length > 1 && isSeriesHovered;

            const opacity =
              !hasSeriesHover || shouldHighlightSeries || shouldHighlightBar
                ? 1
                : 0.4;

            const isLabelVisible =
              shouldShowDataLabels && (!isStacked || isBorderValue);

            const height = innerBarScale?.bandwidth() ?? yScale.bandwidth();
            const value = isNegative ? xStartValue : xEndValue;

            return (
              <>
                <Bar
                  style={{ transition: "opacity 300ms", cursor: "pointer" }}
                  key={`${seriesIndex}:${datumIndex}`}
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  fill={series.color}
                  opacity={opacity}
                  onClick={event => handleClick(event, seriesIndex, datumIndex)}
                  onMouseEnter={event =>
                    handleBarMouseEnter(event, seriesIndex, datumIndex)
                  }
                  onMouseLeave={handleBarMouseLeave}
                />
                {isLabelVisible && (
                  <Text
                    textAnchor={isNegative ? "end" : "start"}
                    fontSize={theme.dataLabels.size}
                    fill={theme.dataLabels.color}
                    fontWeight={theme.dataLabels.weight}
                    dx={(isNegative ? "-" : "") + DATA_LABEL_OFFSET}
                    x={xScale(value)}
                    y={y + height / 2}
                    verticalAnchor="middle"
                  >
                    {labelsFormatter(value)}
                  </Text>
                )}
              </>
            );
          });
        })}

        {goal && (
          <VerticalGoalLine
            x={goalLineX}
            height={innerHeight}
            label={goal.label}
            style={theme.goal}
            position={goal.position}
          />
        )}

        <AxisLeft
          label={yLabel ?? ""}
          labelProps={{
            fill: theme.axis.label.color,
            fontSize: theme.axis.label.size,
            fontWeight: theme.axis.label.weight,
            textAnchor: "middle",
            verticalAnchor: "start",
          }}
          labelOffset={margin.left - theme.axis.label.size}
          tickFormat={yTickFormatter}
          hideTicks
          numTicks={Infinity}
          scale={yScale}
          stroke={theme.axis.color}
          tickStroke={theme.axis.color}
          tickLabelProps={() => ({
            fill: theme.axis.color,
            fontSize: theme.axis.ticks.size,
            fontWeight: theme.axis.ticks.weight,
            textAnchor: "end",
            dy: "0.33em",
          })}
        />
        <AxisBottom
          label={xLabel ?? ""}
          labelProps={{
            fill: theme.axis.label.color,
            fontSize: theme.axis.label.size,
            fontWeight: theme.axis.label.weight,
            verticalAnchor: "end",
            textAnchor: "middle",
          }}
          hideTicks
          tickValues={xTicks}
          tickFormat={xTickFormatter}
          top={innerHeight}
          scale={xScale}
          stroke={theme.axis.color}
          tickStroke={theme.axis.color}
          tickLabelProps={() => ({
            fill: theme.axis.ticks.color,
            fontSize: theme.axis.ticks.size,
            fontWeight: theme.axis.ticks.weight,
            textAnchor: "middle",
          })}
        />
      </Group>
    </svg>
  );
};
