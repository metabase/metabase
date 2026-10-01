import type { XAXisOption } from "echarts/types/dist/shared";

import { PLOT_WIDTH_BREAKPOINTS } from "../../../shared/constants/layout";
import type { ComputedVisualizationSettings } from "../../../types";
import { CHART_STYLE, HORIZONTAL_TICKS_GAP } from "../constants/style";
import type { ChartLayout } from "../layout/types";
import type { NumericXAxisModel } from "../model/types";

type EndpointLabelOptions = Pick<
  NonNullable<XAXisOption["axisLabel"]>,
  | "showMinLabel"
  | "showMaxLabel"
  | "alignMinLabel"
  | "alignMaxLabel"
  | "padding"
  | "interval"
>;

// Interior labels further than this share of the plot from an endpoint label
// cannot collide with it, so they are not measured.
const ENDPOINT_COLLISION_ZONE_RATIO = 0.25;

export function getXAxisEndpointInset(plotWidth: number): number {
  const { small, medium, large } = CHART_STYLE.xAxisEndpointInset;

  if (plotWidth >= PLOT_WIDTH_BREAKPOINTS.large) {
    return large;
  }
  if (plotWidth >= PLOT_WIDTH_BREAKPOINTS.medium) {
    return medium;
  }
  return small;
}

export function hasHorizontalXAxisLabels(
  axisEnabledSetting: ComputedVisualizationSettings["graph.x_axis.axis_enabled"],
): boolean {
  return axisEnabledSetting === true || axisEnabledSetting === "compact";
}

/**
 * Keeps the first and last category labels visible and, when centering one on
 * its band would bring it closer to the plot edge than the inset, aligns it
 * inward instead of shrinking the plot. Data positions never move. Interior
 * labels that would collide with an endpoint label are hidden so that ECharts'
 * overlap resolution, which favors earlier labels, cannot drop the endpoints.
 */
export function getCategoryEndpointLabelOptions(
  datasetLength: number,
  { axisEnabledSetting, boundaryWidth, ticksDimensions }: ChartLayout,
  formatLabel: (value: string) => string,
): EndpointLabelOptions {
  if (datasetLength < 2 || !hasHorizontalXAxisLabels(axisEnabledSetting)) {
    return {};
  }

  const inset = getXAxisEndpointInset(boundaryWidth);
  const bandWidth = boundaryWidth / datasetLength;
  const halfBandWidth = bandWidth / 2;
  const { firstXTickWidth, lastXTickWidth, getXTickWidth } = ticksDimensions;
  const crossesInset = (labelWidth: number) =>
    halfBandWidth - labelWidth / 2 < inset;
  const alignFirst = crossesInset(firstXTickWidth);
  const alignLast = crossesInset(lastXTickWidth);
  // An inward-aligned label starts at its tick, which for narrow bands is
  // still inside the inset; horizontal padding pushes it the rest of the way.
  const insetShortfall = Math.max(inset - halfBandWidth, 0);
  const alignedLabelStart = halfBandWidth + insetShortfall;

  const firstLabelRight = alignFirst
    ? alignedLabelStart + firstXTickWidth
    : halfBandWidth + firstXTickWidth / 2;
  const lastLabelLeft = alignLast
    ? boundaryWidth - alignedLabelStart - lastXTickWidth
    : boundaryWidth - halfBandWidth - lastXTickWidth / 2;
  const collisionZone = boundaryWidth * ENDPOINT_COLLISION_ZONE_RATIO;

  const widths = new Map<string, number>();
  const measure = (value: string) => {
    const label = formatLabel(value);
    let width = widths.get(label);
    if (width === undefined) {
      width = getXTickWidth(label);
      widths.set(label, width);
    }
    return width;
  };

  return {
    showMinLabel: true,
    showMaxLabel: true,
    ...(alignFirst ? { alignMinLabel: "left" as const } : {}),
    ...(alignLast ? { alignMaxLabel: "right" as const } : {}),
    ...((alignFirst || alignLast) && insetShortfall > 0
      ? { padding: [0, insetShortfall] }
      : {}),
    interval: (index: number, value: string) => {
      if (index === 0 || index === datasetLength - 1) {
        return true;
      }

      const center = (index + 0.5) * bandWidth;
      const nearFirst = center - firstLabelRight < collisionZone;
      const nearLast = lastLabelLeft - center < collisionZone;
      if (!nearFirst && !nearLast) {
        return true;
      }

      const halfWidth = measure(value) / 2;
      return (
        center - halfWidth >= firstLabelRight + HORIZONTAL_TICKS_GAP &&
        center + halfWidth <= lastLabelLeft - HORIZONTAL_TICKS_GAP
      );
    },
  };
}

/**
 * Keeps the outermost native ticks of a numeric axis visible: ECharts otherwise
 * drops an endpoint label that touches its neighbour even when that neighbour
 * is hidden by overlap resolution right after. Padded axes end on blank extent
 * labels, so forcing those would hide the real outermost labels instead.
 */
export function getNumericEndpointLabelOptions(
  { isPadded }: Pick<NumericXAxisModel, "isPadded">,
  { axisEnabledSetting }: Pick<ChartLayout, "axisEnabledSetting">,
): Pick<EndpointLabelOptions, "showMinLabel" | "showMaxLabel"> {
  if (isPadded || !hasHorizontalXAxisLabels(axisEnabledSetting)) {
    return {};
  }
  return { showMinLabel: true, showMaxLabel: true };
}
