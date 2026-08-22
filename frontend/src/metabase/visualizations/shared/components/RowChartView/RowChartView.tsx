import type { AxisScale } from "@visx/axis";
import { AxisBottom, AxisLeft, AxisRight } from "@visx/axis";
import { GridColumns } from "@visx/grid";
import { Group } from "@visx/group";
import type { NumberLike, StringLike } from "@visx/scale";
import { scaleBand } from "@visx/scale";
import { Bar } from "@visx/shape";
import { Text } from "@visx/text";
import type { ScaleBand, ScaleContinuousNumeric } from "d3-scale";
import * as React from "react";

import type { TextWidthMeasurer } from "metabase/utils/measure-text";
import { truncateText } from "metabase/visualizations/lib/text";
import type { HoveredData } from "metabase/visualizations/shared/types/events";
import type { Margin } from "metabase/visualizations/shared/types/layout";

import type { SeriesInfo } from "../../types/data";
import type { BarData, RowChartTheme, SeriesData } from "../RowChart/types";
import { VerticalGoalLine } from "../VerticalGoalLine/VerticalGoalLine";

import { DATA_LABEL_OFFSET } from "./constants";
import { getDataLabel } from "./utils/data-labels";

export interface RowChartViewProps<TDatum> {
  width?: number | null;
  height?: number | null;
  yScale: ScaleBand<StringLike>;
  xScale: ScaleContinuousNumeric<number, number, never>;
  seriesData: SeriesData<TDatum, SeriesInfo>[];
  labelsFormatter: (
    value: NumberLike,
    bar?: BarData<TDatum, SeriesInfo>,
  ) => string;
  yTickFormatter: (value: StringLike) => string;
  xTickFormatter: (value: NumberLike) => string;
  xTicks: number[];
  goal: {
    label: string;
    value: number;
    position: "left" | "right";
  } | null;
  theme: RowChartTheme;
  margin: Margin;
  innerWidth: number;
  innerHeight: number;
  labelledSeries?: string[] | null;
  xLabel?: string | null;
  yLabel?: string | null;
  hasXAxis?: boolean;
  hasYAxis?: boolean;
  isStacked?: boolean;
  isRtl?: boolean;
  style?: React.CSSProperties;
  hoveredData?: HoveredData | null;
  measureTextWidth?: TextWidthMeasurer;
  onHover?: (
    event: React.MouseEvent<Element>,
    bar: BarData<TDatum, SeriesInfo> | null,
  ) => void;
  onClick?: (
    event: React.MouseEvent<Element>,
    bar: BarData<TDatum, SeriesInfo>,
  ) => void;
}

const RowChartView = <TDatum,>({
  width,
  height,
  // NOTE: keep this destructured even if it looks unused — `innerWidth` is also a
  // DOM global, so omitting it makes references silently read `window.innerWidth`
  // instead of the prop, with no type error.
  innerWidth,
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
  labelledSeries,
  yLabel,
  xLabel,
  hasXAxis = true,
  hasYAxis = true,
  isStacked,
  isRtl = false,
  style,
  hoveredData,
  measureTextWidth,
  onHover,
  onClick,
}: RowChartViewProps<TDatum>) => {
  const innerBarScale = isStacked
    ? null
    : scaleBand({
        domain: seriesData.map((_, index) => index),
        range: [0, yScale.bandwidth()],
      });

  // Everything upstream — tick selection, side padding for overflowing ticks and
  // data labels, the goal label's side — is computed against a left-to-right
  // `xScale`. Reversing only its *output range* here mirrors the plot for RTL
  // without touching any of that math: value → pixel now grows leftwards.
  const plotXScale = React.useMemo(() => {
    if (!isRtl) {
      return xScale;
    }
    const [rangeStart, rangeEnd] = xScale.range();
    return xScale.copy().range([rangeEnd, rangeStart]);
  }, [isRtl, xScale]);

  const goalLineX = plotXScale(goal?.value ?? 0);

  // `margin.left` is the gutter sized to hold the category labels; under RTL
  // that gutter sits on the physical right, so the plot starts at `margin.right`.
  const plotLeft = isRtl ? margin.right : margin.left;

  // Picking the component rather than passing `orientation` to a generic `Axis`
  // keeps visx's `visx-axis-left` class, which tests and e2e specs select on.
  const CategoryAxis = isRtl ? AxisRight : AxisLeft;

  const ellipsifiedYTickFormatter = React.useMemo(() => {
    if (!measureTextWidth || !width) {
      return yTickFormatter;
    }

    // Calculate the maximum allowed width for y-axis labels (50% of chart width)
    const maxLabelWidth =
      margin.left - (yLabel ? theme.axis.label.size * 2 : 0);

    return (value: StringLike) => {
      const originalText = yTickFormatter(value);
      return truncateText(
        originalText,
        maxLabelWidth,
        measureTextWidth,
        theme.axis.ticks,
      );
    };
  }, [
    measureTextWidth,
    width,
    margin.left,
    yLabel,
    theme.axis.label.size,
    theme.axis.ticks,
    yTickFormatter,
  ]);

  return (
    // `direction: ltr` because the layout below is computed in physical pixels
    // while SVG text-anchor start/end resolve against the writing direction: in
    // RTL the y-axis labels would otherwise extend over the plot area. Bidi still
    // shapes each label, so Arabic/Hebrew text reads correctly.
    <svg
      width={width ?? undefined}
      height={height ?? undefined}
      style={{ direction: "ltr", ...style }}
    >
      <Group top={margin.top} left={plotLeft}>
        <GridColumns
          // Unjustified type cast. FIXME
          scale={plotXScale as AxisScale<number>}
          height={innerHeight}
          stroke={theme.grid.color}
          tickValues={xTicks}
        />

        {seriesData.map((series, seriesIndex) => {
          return series.bars.map((bar) => {
            const { xStartValue, xEndValue, isNegative, yValue, datumIndex } =
              bar;
            let y = yScale(yValue);

            if (y == null || xStartValue == null || xEndValue == null) {
              return null;
            }

            y += innerBarScale?.(seriesIndex) ?? 0;

            // A mirrored scale maps the bar's start to its *right* edge, so take
            // the smaller coordinate rather than assuming the start is leftmost.
            const barStart = plotXScale(xStartValue);
            const barEnd = plotXScale(xEndValue);
            const x = Math.min(barStart, barEnd);
            const width = Math.abs(barEnd - barStart);

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

            const label = getDataLabel(
              bar,
              xScale,
              series.key,
              isStacked,
              labelledSeries,
            );

            // The label sits just past the bar's growing end, which the mirrored
            // scale puts on the opposite physical side.
            const isLabelBeforeBar = isNegative !== isRtl;

            const height = innerBarScale?.bandwidth() ?? yScale.bandwidth();
            const value = isNegative ? xStartValue : xEndValue;
            const barKey = `${seriesIndex}:${datumIndex}`;
            const ariaLabelledBy = `bar-${barKey}-value`;

            return (
              <React.Fragment key={barKey}>
                <Bar
                  aria-label={String(value)}
                  role="graphics-symbol"
                  aria-roledescription="bar"
                  aria-labelledby={label != null ? ariaLabelledBy : undefined}
                  style={{ transition: "opacity 300ms", cursor: "pointer" }}
                  key={barKey}
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  fill={series.color}
                  opacity={opacity}
                  onClick={(event) => onClick?.(event, bar)}
                  onMouseEnter={(event) => onHover?.(event, bar)}
                  onMouseLeave={(event) => onHover?.(event, null)}
                />
                {label != null && (
                  <Text
                    data-testid="data-label"
                    id={ariaLabelledBy}
                    textAnchor={isLabelBeforeBar ? "end" : "start"}
                    fontSize={theme.dataLabels.size}
                    fill={theme.dataLabels.color}
                    fontWeight={theme.dataLabels.weight}
                    dx={(isLabelBeforeBar ? "-" : "") + DATA_LABEL_OFFSET}
                    x={plotXScale(value)}
                    y={y + height / 2}
                    verticalAnchor="middle"
                  >
                    {labelsFormatter(label, bar)}
                  </Text>
                )}
              </React.Fragment>
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

        <CategoryAxis
          left={isRtl ? innerWidth : 0}
          label={yLabel ?? ""}
          labelProps={{
            fill: theme.axis.label.color,
            fontFamily: theme.dataLabels.family,
            fontSize: theme.axis.label.size,
            fontWeight: theme.axis.label.weight,
            textAnchor: "middle",
            verticalAnchor: "start",
            ...(isRtl ? { style: { direction: "rtl" as const } } : null),
          }}
          labelOffset={margin.left - theme.axis.label.size}
          tickFormat={ellipsifiedYTickFormatter}
          hideAxisLine={!hasYAxis}
          hideTicks
          tickValues={hasYAxis ? undefined : []}
          numTicks={Infinity}
          scale={yScale}
          stroke={theme.axis.color}
          tickStroke={theme.axis.color}
          tickLabelProps={() => ({
            fill: theme.axis.ticks.color,
            fontFamily: theme.dataLabels.family,
            fontSize: theme.axis.ticks.size,
            fontWeight: theme.axis.ticks.weight,
            // Category names are the only prose in the chart, so they opt back
            // into RTL text semantics (see the `direction: ltr` note on the svg):
            // that puts a truncation ellipsis and any Latin/numeric runs at the
            // reading end. `text-anchor` resolves against that direction, so
            // "end" is the *left* edge here — which is the one touching a
            // right-hand axis, leaving the label to read outwards into the gutter.
            ...(isRtl ? { style: { direction: "rtl" as const } } : null),
            textAnchor: "end",
            dy: "0.33em",
          })}
        />
        <AxisBottom
          label={xLabel ?? ""}
          labelProps={{
            fill: theme.axis.label.color,
            fontFamily: theme.dataLabels.family,
            fontSize: theme.axis.label.size,
            fontWeight: theme.axis.label.weight,
            textAnchor: "middle",
            dy: hasXAxis ? undefined : "-1em",
            ...(isRtl ? { style: { direction: "rtl" as const } } : null),
          }}
          hideAxisLine={!hasXAxis}
          hideTicks
          tickValues={hasXAxis ? xTicks : []}
          tickFormat={xTickFormatter}
          top={innerHeight}
          // Unjustified type cast. FIXME
          scale={plotXScale as AxisScale<number>}
          stroke={theme.axis.color}
          tickStroke={theme.axis.color}
          tickLabelProps={() => ({
            fill: theme.axis.ticks.color,
            fontFamily: theme.dataLabels.family,
            fontSize: theme.axis.ticks.size,
            fontWeight: theme.axis.ticks.weight,
            textAnchor: "middle",
          })}
        />
      </Group>
    </svg>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default RowChartView;
