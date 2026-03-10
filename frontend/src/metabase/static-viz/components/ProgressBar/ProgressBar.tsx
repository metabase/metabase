import { ClipPath } from "@visx/clip-path";
import { Group } from "@visx/group";
import { scaleLinear } from "@visx/scale";
import { useMemo } from "react";
import { c } from "ttag";

import { formatValue } from "metabase/lib/formatting";
import {
  calculateProgressMetrics,
  extractProgressValue,
  findProgressColumn,
  getGoalValue,
  getProgressColors,
  getProgressMessage,
} from "metabase/visualizations/visualizations/Progress/utils";
import type { DatasetColumn } from "metabase-types/api";

import Watermark from "../../watermark.svg?component";
import type { StaticChartProps } from "../StaticVisualization/types";
import { Text } from "../Text";

import { CheckMarkIcon } from "./CheckMarkIcon";
import { Pointer } from "./Pointer";
import { calculatePointerLabelShift } from "./utils";

const layout = {
  width: 440,
  height: 110,
  margin: {
    top: 40,
    right: 40,
    left: 40,
  },
  barHeight: 40,
  borderRadius: 5,
  labelsMargin: 16,
  iconSize: 20,
  pointer: {
    width: 20,
    height: 10,
  },
  fontSize: 13,
};

export const ProgressBar = ({
  rawSeries,
  settings,
  renderingContext,
  hasDevWatermark = false,
}: StaticChartProps) => {
  const {
    data: { cols, rows },
  } = rawSeries[0];

  const { data, metrics, colors, column } = useMemo(() => {
    const valueField = settings["progress.value"];
    const goalSetting = settings["progress.goal"] ?? 0;

    const column = findProgressColumn(cols, valueField);
    const columnIndex = column
      ? cols.findIndex((col: DatasetColumn) => col.name === column.name)
      : -1;

    const value = extractProgressValue(rows, columnIndex);
    const goal = getGoalValue(goalSetting, cols, rows);

    const metrics = calculateProgressMetrics(value, goal);

    const mainColor =
      settings["progress.color"] || renderingContext.getColor("accent1");
    const colors = getProgressColors(mainColor, value, goal);

    return {
      data: { value, goal },
      metrics,
      colors,
      column: column || cols[0],
    };
  }, [cols, rows, settings, renderingContext]);

  const columnSettings = settings.column?.(column) ?? {};
  const barWidth = layout.width - layout.margin.left - layout.margin.right;

  const xMin = layout.margin.left;
  const xMax = xMin + barWidth;

  const labelsY = layout.margin.top + layout.barHeight + layout.labelsMargin;

  const xScale = scaleLinear({
    domain: [0, 1],
    range: [0, barWidth],
  });

  const currentX = xScale(metrics.barPercent);
  const pointerY = layout.margin.top - layout.pointer.height * 1.5;
  const pointerX = xMin + xScale(metrics.arrowPercent);

  const barMessage = getProgressMessage(metrics);
  const valueText = metrics.hasValidValue
    ? String(formatValue(data.value, columnSettings) ?? "—")
    : "—";

  const valueTextShift = calculatePointerLabelShift(
    valueText,
    pointerX,
    xMin,
    xMax,
    layout.pointer.width,
    layout.fontSize,
  );

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={layout.width}
      height={layout.height}
    >
      <ClipPath id="rounded-bar">
        <rect
          width={barWidth}
          height={layout.barHeight}
          rx={layout.borderRadius}
        />
      </ClipPath>
      <Group clipPath="url(#rounded-bar)" top={layout.margin.top} left={xMin}>
        <rect
          width={barWidth}
          height={layout.barHeight}
          fill={colors.background}
        />
        <rect
          width={currentX}
          height={layout.barHeight}
          fill={colors.foreground}
        />
        {barMessage &&
          metrics.hasValidValue &&
          metrics.hasValidGoal &&
          (metrics.value >= metrics.goal ? (
            <>
              <CheckMarkIcon
                size={layout.iconSize}
                // eslint-disable-next-line metabase/no-color-literals
                color="#ffffff"
                x={10}
                y={(layout.barHeight - layout.iconSize) / 2}
              />
              <Text
                fontSize={layout.fontSize}
                textAnchor="start"
                x={layout.iconSize + 16}
                y={layout.barHeight / 2}
                verticalAnchor="middle"
                // eslint-disable-next-line metabase/no-color-literals
                fill="#ffffff"
              >
                {barMessage}
              </Text>
            </>
          ) : null)}
      </Group>
      <Group left={pointerX} top={pointerY}>
        <Text
          fontSize={layout.fontSize}
          textAnchor="middle"
          dy="-0.4em"
          dx={valueTextShift}
        >
          {valueText}
        </Text>
        <Pointer
          width={layout.pointer.width}
          height={layout.pointer.height}
          fill={colors.pointer}
        />
      </Group>
      <Group top={labelsY}>
        <Text
          fontSize={layout.fontSize}
          textAnchor="start"
          alignmentBaseline="baseline"
          x={layout.margin.left}
        >
          {String(formatValue(0, columnSettings) ?? "0")}
        </Text>
        <Text fontSize={layout.fontSize} textAnchor="end" x={xMax}>
          {metrics.hasValidGoal
            ? c("Label showing goal value in progress chart")
                .t`Goal ${String(formatValue(data.goal, columnSettings) ?? data.goal)}`
            : c("Label when no goal is set in progress chart").t`Goal: Not set`}
        </Text>
      </Group>
      {hasDevWatermark && (
        <Watermark
          x="0"
          y="0"
          height={layout.height}
          width={layout.width}
          preserveAspectRatio="xMidYMid slice"
          fill={renderingContext.getColor("text-secondary")}
          opacity={0.2}
        />
      )}
    </svg>
  );
};
