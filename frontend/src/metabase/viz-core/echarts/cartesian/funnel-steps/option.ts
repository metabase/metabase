import Color from "color";
import type { BarSeriesOption } from "echarts/charts";
import type { EChartsCoreOption } from "echarts/core";
import { t } from "ttag";

import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "../../../types";
import { CHART_STYLE } from "../constants/style";
import type { ChartLayout } from "../layout/types";
import type { BaseCartesianChartModel } from "../model/types";
import { getSharedEChartsOptions } from "../option";
import { getTicksDefaultOption } from "../option/axis";

import { FUNNEL_STEPS_GHOST_SERIES_ID } from "./model";
import { getFunnelSteps } from "./steps";

const BAR_WIDTH_RATIO = 0.67;
const Y_AXIS_SPLIT_NUMBER = 4;
const COUNT_LABEL_OFFSET_PX = 10;
const STEP_LABEL_OFFSET_PX = 14;
const GHOST_FILL_ALPHA = 0.06;
const GHOST_HATCH_ALPHA = 0.3;
const FONT_SIZE = { count: 15, stepName: 14, dropOff: 12 };
const LINE_HEIGHT = { count: 20, stepName: 22, dropOff: 18 };
const COUNT_SHARE_GAP_PX = 16;
const RICH_TEXT_MARKUP = /[{}|]/g;

// Wraps text in an ECharts rich text fragment, dropping characters that would be
// read as markup (step names come from event names in the data)
const toRichText = (styleName: string, text: string) =>
  `{${styleName}|${text.replace(RICH_TEXT_MARKUP, "")}}`;

// The layout reserves space for the axes; the step labels need room on top of that
const getGrid = ({ padding }: ChartLayout) => ({
  top: padding.top + COUNT_LABEL_OFFSET_PX + LINE_HEIGHT.count,
  right: padding.right,
  bottom:
    padding.bottom +
    STEP_LABEL_OFFSET_PX +
    LINE_HEIGHT.stepName +
    LINE_HEIGHT.dropOff,
  left: padding.left,
});

/**
 * Funnel steps as bars: each step's count drawn over a hatched full-height
 * "ghost" bar, with the count and percent of the first step above it and the
 * step name and drop-off below it.
 */
export const getFunnelStepsOption = (
  chartModel: BaseCartesianChartModel,
  chartLayout: ChartLayout,
  settings: ComputedVisualizationSettings,
  chartWidth: number,
  isAnimated: boolean,
  renderingContext: RenderingContext,
): EChartsCoreOption => {
  const steps = getFunnelSteps(chartModel, settings);
  if (!steps) {
    return {};
  }
  const { seriesModel, stepNames, counts, formatCount, formatShare } = steps;

  const { getColor, fontFamily } = renderingContext;
  const textPrimary = getColor("text-primary");
  const textSecondary = getColor("text-secondary");

  const firstCount = counts[0] ?? 0;
  const maxCount = Math.max(0, ...counts);

  const getDropOffText = (index: number) =>
    index === 0
      ? t`Everyone started here`
      : t`${formatCount(counts[index - 1] - counts[index])} dropped off here`;

  const grid = getGrid(chartLayout);
  const gridWidth = chartWidth - grid.left - grid.right;
  const barWidth = (gridWidth / Math.max(counts.length, 1)) * BAR_WIDTH_RATIO;
  // A step without a color of its own takes the series color.
  const stepColors = counts.map((_count, index) =>
    Color(
      settings["product_analytics.funnel_step_colors"]?.[index] ??
        seriesModel.color,
    ),
  );

  const ghostSeries: BarSeriesOption = {
    id: FUNNEL_STEPS_GHOST_SERIES_ID,
    type: "bar",
    barWidth,
    barGap: "-100%",
    data: counts.map((_count, index) => ({
      value: maxCount,
      itemStyle: {
        color: stepColors[index].alpha(GHOST_FILL_ALPHA).string(),
        decal: {
          symbol: "rect",
          symbolSize: 1,
          dashArrayX: [1, 0],
          dashArrayY: [1, 7],
          rotation: -Math.PI / 4,
          color: stepColors[index].alpha(GHOST_HATCH_ALPHA).string(),
        },
      },
    })),
    // The ghost spans the full plot height, so its labels line up across the top
    label: {
      show: true,
      position: [0, -COUNT_LABEL_OFFSET_PX],
      align: "left",
      verticalAlign: "bottom",
      fontFamily,
      formatter: ({ dataIndex }) =>
        toRichText("count", formatCount(counts[dataIndex])) +
        toRichText("share", formatShare(counts[dataIndex], firstCount)),
      rich: {
        count: {
          fontSize: FONT_SIZE.count,
          fontWeight: "bold",
          color: textPrimary,
        },
        share: {
          fontSize: FONT_SIZE.count,
          color: textSecondary,
          padding: [0, 0, 0, COUNT_SHARE_GAP_PX],
        },
      },
    },
  };

  const stepSeries: BarSeriesOption = {
    id: seriesModel.dataKey,
    type: "bar",
    barWidth,
    barGap: "-100%",
    data: counts.map((count, index) => ({
      value: count,
      itemStyle: { color: stepColors[index].string() },
    })),
    label: {
      show: true,
      position: [0, "100%"],
      offset: [0, STEP_LABEL_OFFSET_PX],
      align: "left",
      verticalAlign: "top",
      width: barWidth,
      overflow: "truncate",
      fontFamily,
      formatter: ({ dataIndex }) =>
        `${toRichText("stepName", stepNames[dataIndex])}\n${toRichText("dropOff", getDropOffText(dataIndex))}`,
      rich: {
        stepName: {
          fontSize: FONT_SIZE.stepName,
          fontWeight: "bold",
          color: textPrimary,
          lineHeight: LINE_HEIGHT.stepName,
        },
        dropOff: {
          fontSize: FONT_SIZE.dropOff,
          color: textSecondary,
          lineHeight: LINE_HEIGHT.dropOff,
        },
      },
    },
  };

  return {
    ...getSharedEChartsOptions(isAnimated, renderingContext),
    textStyle: { fontFamily },
    grid: { ...grid, outerBoundsMode: "none" },
    xAxis: {
      type: "category",
      data: stepNames,
      axisTick: { show: false },
      axisLabel: { show: false },
      axisLine: { lineStyle: { color: getColor("border-neutral") } },
    },
    yAxis: {
      type: "value",
      max: maxCount > 0 ? maxCount : undefined,
      splitNumber: Y_AXIS_SPLIT_NUMBER,
      splitLine: {
        lineStyle: renderingContext.theme.cartesian.splitLine.lineStyle,
      },
      axisLabel: {
        ...getTicksDefaultOption(renderingContext),
        margin: CHART_STYLE.axisTicksMarginY,
        formatter: (value: number) => formatCount(value, true),
      },
    },
    series: [ghostSeries, stepSeries],
  };
};
