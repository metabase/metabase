import type { XAXisOption } from "echarts/types/dist/shared";

import { HORIZONTAL_TICKS_GAP } from "../constants/style";
import type { ChartLayout } from "../layout/types";

const MAX_LABEL_PADDING_RATIO = 0.25;

export function getXAxisWidth(chartLayout: ChartLayout): number {
  return (
    chartLayout.outerWidth -
    chartLayout.padding.left -
    chartLayout.padding.right
  );
}

export function getXAxisLabelPadding(axisWidth: number): number {
  if (axisWidth >= 900) {
    return 24;
  }
  if (axisWidth >= 300) {
    return 16;
  }
  return 8;
}

export function getContinuousAxisPadding(
  padding: number,
  domainWidth: number,
  chartLayout: ChartLayout,
): number {
  if (
    chartLayout.axisEnabledSetting !== true &&
    chartLayout.axisEnabledSetting !== "compact"
  ) {
    return padding;
  }

  const axisWidth = getXAxisWidth(chartLayout);
  const { firstXTickWidth, lastXTickWidth } = chartLayout.ticksDimensions;
  const labelWidth = Math.max(firstXTickWidth, lastXTickWidth);
  const requestedPadding = getXAxisLabelPadding(axisWidth) + labelWidth / 2;
  if (axisWidth <= 2 * requestedPadding) {
    return padding;
  }
  const endpointPadding = Math.min(
    requestedPadding,
    axisWidth * MAX_LABEL_PADDING_RATIO,
  );
  const availableWidth = axisWidth - 2 * endpointPadding;

  return Math.max(padding, (domainWidth * endpointPadding) / availableWidth);
}

type EndpointLabelOptions = Pick<
  NonNullable<XAXisOption["axisLabel"]>,
  "alignMinLabel" | "alignMaxLabel" | "padding" | "interval"
>;

export function getCategoricalAxisLabelPadding(
  datasetLength: number,
  chartLayout: ChartLayout,
  formatter: (value: string) => string = String,
): EndpointLabelOptions {
  if (
    datasetLength <= 1 ||
    (chartLayout.axisEnabledSetting !== true &&
      chartLayout.axisEnabledSetting !== "compact")
  ) {
    return {};
  }

  const axisWidth = getXAxisWidth(chartLayout);
  const padding = getXAxisLabelPadding(axisWidth);
  const endpointPosition = axisWidth / datasetLength / 2;
  const { firstXTickWidth, lastXTickWidth } = chartLayout.ticksDimensions;
  const alignMinLabel = endpointPosition - firstXTickWidth / 2 < padding;
  const alignMaxLabel = endpointPosition - lastXTickWidth / 2 < padding;

  if (!alignMinLabel && !alignMaxLabel) {
    return {};
  }

  const interval = Math.max(
    1,
    Math.ceil(
      ((Math.max(firstXTickWidth, lastXTickWidth) + HORIZONTAL_TICKS_GAP) *
        datasetLength) /
        axisWidth,
    ),
  );
  const labelWidths = new Map<string, number>();

  return {
    alignMinLabel: alignMinLabel ? "left" : undefined,
    alignMaxLabel: alignMaxLabel ? "right" : undefined,
    padding: [0, padding - endpointPosition],
    interval: (index, value) => {
      if (index === 0 || index === datasetLength - 1) {
        return true;
      }
      if (index % interval !== 0) {
        return false;
      }
      const position = ((index + 0.5) * axisWidth) / datasetLength;
      const label = formatter(value);
      let labelWidth = labelWidths.get(label);
      if (labelWidth === undefined) {
        labelWidth = chartLayout.ticksDimensions.getXTickWidth(label);
        labelWidths.set(label, labelWidth);
      }
      return (
        position - labelWidth / 2 >= padding &&
        position + labelWidth / 2 <= axisWidth - padding
      );
    },
  };
}
