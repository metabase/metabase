import React from "react";
import { Group } from "@visx/group";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { Bar } from "@visx/shape";
import type { NumberValue, ScaleBand, ScaleLinear } from "d3-scale";
import { Text } from "@visx/text";
import { GridColumns } from "@visx/grid";
import { HoveredData } from "metabase/visualizations/types/events";
import { ChartGoal } from "metabase/visualizations/types/settings";
import { ChartTheme } from "metabase/visualizations/types/theme";
import { Margin } from "metabase/visualizations/types/layout";
import { ChartBar } from "../utils/layout";
import { VerticalGoalLine } from "./VerticalGoalLine";

export interface RowChartViewProps {
  width: number;
  height: number;
  yScale: ScaleBand<string>;
  xScale: ScaleLinear<number, number, never>;
  barsSeries: (ChartBar | null)[][];
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
  labelsFormatter: (value: NumberValue) => string;
  yTickFormatter: (value: string | number) => string;
  xTickFormatter: (value: NumberValue) => string;
  goal: ChartGoal | null;
  theme: ChartTheme;
  margin: Margin;
  innerWidth: number;
  innerHeight: number;
  xTicksCount: number;
  shouldShowDataLabels?: boolean;
  xLabel?: string | null;
  yLabel?: string | null;
}

export const RowChartView = ({
  width,
  height,
  innerHeight,
  xScale,
  yScale,
  barsSeries,
  goal,
  theme,
  margin,
  hoveredData,
  labelsFormatter,
  yTickFormatter,
  xTickFormatter,
  onHover,
  onClick,
  xTicksCount,
  shouldShowDataLabels,
  yLabel,
  xLabel,
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

  const goalLineX = xScale(goal?.value ?? 0);

  return (
    <svg width={width} height={height}>
      <Group top={margin.top} left={margin.left}>
        <GridColumns
          scale={xScale}
          height={innerHeight}
          stroke={theme.grid.color}
          numTicks={xTicksCount}
        />

        {barsSeries.map((series, seriesIndex) => {
          return series.map((bar, datumIndex) => {
            if (bar == null) {
              return null;
            }

            const { x, y, width, height, value, color } = bar;

            const hasSeriesHover = hoveredData != null;
            const isSeriesHovered = hoveredData?.seriesIndex === seriesIndex;
            const isDatumHovered = hoveredData?.datumIndex === datumIndex;

            const shouldHighlightBar =
              barsSeries.length === 1 && isDatumHovered;
            const shouldHighlightSeries =
              barsSeries.length > 1 && isSeriesHovered;

            const opacity =
              !hasSeriesHover || shouldHighlightSeries || shouldHighlightBar
                ? 1
                : 0.4;

            const isLabelVisible = shouldShowDataLabels && value != null;

            return (
              <>
                <Bar
                  style={{ transition: "opacity 300ms", cursor: "pointer" }}
                  key={`${seriesIndex}:${datumIndex}`}
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  fill={color}
                  opacity={opacity}
                  onClick={event => handleClick(event, seriesIndex, datumIndex)}
                  onMouseEnter={event =>
                    handleBarMouseEnter(event, seriesIndex, datumIndex)
                  }
                  onMouseLeave={handleBarMouseLeave}
                />
                {isLabelVisible && (
                  <Text
                    fontSize={theme.dataLabels.size}
                    fill={theme.dataLabels.color}
                    fontWeight={theme.dataLabels.weight}
                    dx="0.33em"
                    x={x + width}
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
          numTicks={xTicksCount}
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
