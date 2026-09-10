import type { XAXisOption } from "echarts/types/dist/shared";

import { HORIZONTAL_TICKS_GAP } from "../constants/style";
import type { ChartLayout } from "../layout/types";

const MAX_LABEL_PADDING_RATIO = 0.25;
const MAX_REJECTED_LABEL_SAMPLES = 50;

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

  const labelWidths = new Map<string, number>();
  const getLabelWidth = (value: string) => {
    const label = formatter(value);
    let width = labelWidths.get(label);
    if (width === undefined) {
      width = chartLayout.ticksDimensions.getXTickWidth(label);
      labelWidths.set(label, width);
    }
    return width;
  };
  const labelSpacesWidth = chartLayout.ticksDimensions.getXTickWidth("  ");
  const lastLabelWidth = lastXTickWidth + labelSpacesWidth;
  const lastLabelLeft = alignMaxLabel
    ? axisWidth - padding - lastLabelWidth
    : axisWidth - endpointPosition - lastLabelWidth / 2;
  const rejectedLabelInterval = Math.max(
    1,
    Math.ceil(datasetLength / MAX_REJECTED_LABEL_SAMPLES),
  );
  let previousLabelRight = 0;
  let nextLabelPosition = 0;

  return {
    alignMinLabel: alignMinLabel ? "left" : undefined,
    alignMaxLabel: alignMaxLabel ? "right" : undefined,
    padding: [0, padding - endpointPosition],
    interval: (index, value) => {
      if (index === 0) {
        // ECharts visits categories in order for each estimation/render pass.
        const labelWidth = getLabelWidth(value);
        previousLabelRight = alignMinLabel
          ? padding + labelWidth
          : endpointPosition + labelWidth / 2;
        nextLabelPosition = previousLabelRight;
        return true;
      }
      if (index === datasetLength - 1) {
        return true;
      }
      const position = ((index + 0.5) * axisWidth) / datasetLength;
      if (position < nextLabelPosition) {
        return false;
      }
      const labelWidth = getLabelWidth(value);
      const labelRight = position + labelWidth / 2;
      if (
        position - labelWidth / 2 < previousLabelRight ||
        labelRight > lastLabelLeft
      ) {
        nextLabelPosition =
          ((index + rejectedLabelInterval + 0.5) * axisWidth) / datasetLength;
        return false;
      }
      nextLabelPosition =
        position + Math.max(labelWidth / 2, HORIZONTAL_TICKS_GAP);
      previousLabelRight = labelRight;
      return true;
    },
  };
}
