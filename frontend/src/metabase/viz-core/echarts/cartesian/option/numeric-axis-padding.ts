import { helper } from "echarts/core";

import { HORIZONTAL_TICKS_GAP } from "../constants/style";
import type { ChartLayout, DashboardXAxis } from "../layout/types";
import type { NumericXAxisModel } from "../model/types";

import { getXAxisLabelValues } from "./x-axis-labels";
import { getDashboardXAxisLayout } from "./x-axis-padding";

function getTickCandidates(
  axis: NumericXAxisModel,
  splitNumber: number,
): number[] {
  const [min, max] = axis.extent;
  const { ticksMaxInterval } = axis;
  if (ticksMaxInterval !== undefined && ticksMaxInterval > 0) {
    const rawMin = axis.fromEChartsAxisValue(min);
    const rawMax = axis.fromEChartsAxisValue(max);
    const intervalsCount = (rawMax - rawMin) / ticksMaxInterval;
    const stride = Math.max(1, Math.ceil(intervalsCount / splitNumber));
    const ticks: number[] = [];
    for (let index = stride; index < intervalsCount; index += stride) {
      const value = axis.toEChartsAxisValue(rawMin + index * ticksMaxInterval);
      if (
        value !== null &&
        Number.isFinite(value) &&
        value > min &&
        value < max
      ) {
        ticks.push(value);
      }
    }
    return ticks;
  }

  return helper
    .createScale(axis.extent, {
      type: "value",
      scale: true,
      min,
      max,
      minInterval: axis.interval,
      splitNumber,
    })
    .getTicks()
    .map(({ value }) => value)
    .filter((value) => value > min && value < max);
}

export function getNumericAxisPadding(
  axis: NumericXAxisModel,
  chartLayout: ChartLayout,
): DashboardXAxis | undefined {
  if (
    !axis.isDashboard ||
    !axis.isPadded ||
    !axis.extent.every(Number.isFinite) ||
    axis.extent[0] >= axis.extent[1] ||
    (chartLayout.axisEnabledSetting !== true &&
      chartLayout.axisEnabledSetting !== "compact")
  ) {
    return undefined;
  }

  const [min, max] = axis.extent;
  const formatLabel = (value: number) =>
    axis.formatter(axis.fromEChartsAxisValue(value));
  const layout = getDashboardXAxisLayout(
    axis.extent,
    chartLayout,
    formatLabel(min),
    formatLabel(max),
    axis.intervalsCount,
  );
  if (layout === undefined) {
    return undefined;
  }

  const { extent, axisWidth, padding, step } = layout;
  const widths = new Map<string, number>();
  const getLabelWidth = (text: string) => {
    let width = widths.get(text);
    if (width === undefined) {
      width = chartLayout.ticksDimensions.getXTickWidth(text);
      widths.set(text, width);
    }
    return width;
  };
  const firstLabelWidth = getLabelWidth(formatLabel(min));
  const lastLabelWidth = getLabelWidth(formatLabel(max));
  const splitNumber = Math.max(
    1,
    Math.floor(
      axisWidth /
        (Math.max(firstLabelWidth, lastLabelWidth) + HORIZONTAL_TICKS_GAP),
    ),
  );
  const candidates = [min, ...getTickCandidates(axis, splitNumber), max];
  const ticks = getXAxisLabelValues({
    centerEndpoints: layout.centerLabels,
    valuesCount: candidates.length,
    getValue: (index) => candidates[index],
    getPosition: (value) =>
      ((value - extent[0]) / (extent[1] - extent[0])) * axisWidth,
    formatLabel,
    getLabelWidth,
    axisWidth,
    padding,
  });
  if (ticks === undefined) {
    return undefined;
  }

  return {
    step,
    options: {
      type: "value",
      scale: true,
      min: extent[0],
      max: extent[1],
      containShape: false,
      axisLabel: {
        customValues: ticks,
        ...layout.axisLabel,
        showMinLabel: true,
        showMaxLabel: true,
        hideOverlap: false,
        formatter: formatLabel,
      },
    },
  };
}
