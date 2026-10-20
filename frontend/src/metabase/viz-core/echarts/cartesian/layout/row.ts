// Layout for row charts: a cartesian bar chart with the axes swapped.
import type {
  ComputedVisualizationSettings,
  Padding,
  RenderingContext,
} from "../../../types";
import {
  NEGATIVE_STACK_TOTAL_DATA_KEY,
  POSITIVE_STACK_TOTAL_DATA_KEY,
  X_AXIS_DATA_KEY,
} from "../constants/dataset";
import { CHART_STYLE } from "../constants/style";
import { getStackTotalValue } from "../model/series";
import type { LabelFormatter } from "../model/types";
import { getPaddedAxisLabel } from "../option/utils";
import { ROW_CHART_STYLE } from "../row/constants";
import { getRowChartSpacing } from "../row/spacing";

import type { ChartLayout, TicksDimensions } from "./types";
import { type ChartLayoutInput, getChartBounds, getDataset } from "./utils";

// Caps the category label gutter so long names still leave room for bars.
const ROW_CHART_LABEL_MAX_WIDTH_RATIO = 0.5;

// Upright `TicksDimensions` with roles swapped: `yTicksWidthLeft` holds the
// category labels, `xTicksHeight` the metric ticks.
const getRowChartTicksDimensions = (
  input: ChartLayoutInput,
  settings: ComputedVisualizationSettings,
  chartWidth: number,
  renderingContext: RenderingContext,
): TicksDimensions => {
  const { measureText, fontFamily, theme } = renderingContext;
  const { tickFontSize, categoryTickMargin, metricTickMargin } =
    getRowChartSpacing(theme);
  const fontStyle = {
    ...CHART_STYLE.axisTicks,
    family: fontFamily,
    size: tickFontSize,
  };

  const hasCategoryTicks = settings["graph.x_axis.axis_enabled"] !== false;
  const hasMetricTicks = settings["graph.y_axis.axis_enabled"] !== false;

  const formatter = input.xAxisModel.formatter;
  const widestLabel = hasCategoryTicks
    ? getDataset(input).reduce((widest, datum) => {
        // Measured as drawn: the category axis pads each label with spaces.
        const label = getPaddedAxisLabel(formatter(datum[X_AXIS_DATA_KEY]));
        return Math.max(widest, measureText(label, fontStyle));
      }, 0)
    : 0;

  const cap = chartWidth * ROW_CHART_LABEL_MAX_WIDTH_RATIO;
  const isCapped = widestLabel > cap;

  return {
    yTicksWidthLeft: hasCategoryTicks
      ? Math.min(widestLabel, cap) + categoryTickMargin
      : 0,
    yTicksWidthRight: 0,
    xTicksHeight: hasMetricTicks ? tickFontSize + metricTickMargin : 0,
    xTickWidthCap: isCapped ? cap : Infinity,
    firstXTickWidth: 0,
    lastXTickWidth: 0,
    getXTickWidth: (text: string) => measureText(text, fontStyle),
  };
};

// Room for data labels past each bar's end: right of positive bars, left of
// negative ones.
const getRowChartDataLabelsWidths = (
  input: ChartLayoutInput,
  settings: ComputedVisualizationSettings,
  { measureText, fontFamily, theme }: RenderingContext,
): { positive: number; negative: number } => {
  if (!settings["graph.show_values"]) {
    return { positive: 0, negative: 0 };
  }

  const hiddenSeriesKeys = new Set(
    (input.seriesModels ?? [])
      .filter((series) => !series.visible)
      .map((series) => series.dataKey),
  );
  const stackedLabelsFormatters = input.stackedLabelsFormatters ?? {};
  const seriesLabelsFormatters = input.seriesLabelsFormatters ?? {};

  // Every value label drawn: each stack's per-sign total, as the totals series
  // computes it, plus every labelled non-stacked value.
  const labels = getDataset(input).flatMap(
    (datum): { value: number; formatter: LabelFormatter }[] => {
      const stackTotals = (input.stackModels ?? []).flatMap((stackModel) => {
        const formatter = stackedLabelsFormatters[stackModel.display];
        if (formatter == null) {
          return [];
        }
        const stackKeys = stackModel.seriesKeys.filter(
          (dataKey) => !hiddenSeriesKeys.has(dataKey),
        );
        return [POSITIVE_STACK_TOTAL_DATA_KEY, NEGATIVE_STACK_TOTAL_DATA_KEY]
          .map((signKey) => getStackTotalValue(datum, stackKeys, signKey))
          .filter((value): value is number => value != null)
          .map((value) => ({ value, formatter }));
      });

      const seriesValues = Object.entries(seriesLabelsFormatters).flatMap(
        ([dataKey, formatter]) => {
          const value = datum[dataKey];
          return formatter != null &&
            !hiddenSeriesKeys.has(dataKey) &&
            typeof value === "number"
            ? [{ value, formatter }]
            : [];
        },
      );

      return [...stackTotals, ...seriesValues];
    },
  );

  const fontStyle = {
    family: fontFamily,
    weight: CHART_STYLE.seriesLabels.weight,
    size: theme.cartesian.label.fontSize,
  };
  const sideOf = (value: number) => (value < 0 ? "negative" : "positive");
  const { fromEChartsAxisValue } = input.yAxisScaleTransforms;
  const widestOn = (side: "positive" | "negative") => {
    const widths = labels
      .filter(({ value }) => sideOf(value) === side)
      // Labels show the original value, not its log or power transform.
      .map(({ value, formatter }) =>
        measureText(String(formatter(fromEChartsAxisValue(value))), fontStyle),
      );
    return widths.length === 0
      ? 0
      : Math.max(...widths) + CHART_STYLE.seriesLabels.offset;
  };

  return { positive: widestOn("positive"), negative: widestOn("negative") };
};

// Built in row terms because every reserve in `getCartesianChartPadding`
// assumes an upright chart.
const getRowChartPadding = (
  input: ChartLayoutInput,
  settings: ComputedVisualizationSettings,
  ticksDimensions: TicksDimensions,
  dataLabelsWidth: number,
  renderingContext: RenderingContext,
): Padding => {
  const { theme } = renderingContext;
  const { axisTitleFontSize, metricAxisTitleMargin, dimensionAxisTitleMargin } =
    getRowChartSpacing(theme);
  // The same title reserves as upright charts' bottom and left axes.
  const metricNameHeight = axisTitleFontSize / 2 + metricAxisTitleMargin;
  const dimensionNameWidth = axisTitleFontSize + dimensionAxisTitleMargin;
  // Mirrors what the axis builders render as each axis's `name`.
  const hasDimensionName = Boolean(
    settings["graph.x_axis.labels_enabled"] &&
    settings["graph.x_axis.title_text"],
  );
  const hasMetricName = Boolean(input.leftAxisModel?.label);
  // Static renders label the goal above the plot; the interactive goal marker
  // fits in the base padding.
  const hasGoalLabel = Boolean(
    renderingContext.isStatic &&
    settings["graph.show_goal"] &&
    settings["graph.goal_label"],
  );

  return {
    top:
      CHART_STYLE.padding.y +
      (hasGoalLabel
        ? theme.cartesian.label.fontSize + CHART_STYLE.seriesLabels.offset
        : 0),
    left:
      CHART_STYLE.padding.x +
      ticksDimensions.yTicksWidthLeft +
      (hasDimensionName ? dimensionNameWidth : 0),
    bottom:
      CHART_STYLE.padding.y +
      ticksDimensions.xTicksHeight +
      (hasMetricName ? metricNameHeight : 0),
    // Row charts have a single metric axis, so nothing else sits on the right.
    right: CHART_STYLE.padding.x + dataLabelsWidth,
  };
};

export const getRowChartLayout = (
  input: ChartLayoutInput,
  settings: ComputedVisualizationSettings,
  width: number,
  height: number,
  renderingContext: RenderingContext,
): ChartLayout => {
  const ticksDimensions = getRowChartTicksDimensions(
    input,
    settings,
    width,
    renderingContext,
  );

  const dataLabelsWidths = getRowChartDataLabelsWidths(
    input,
    settings,
    renderingContext,
  );

  // ECharts ignores `boundaryGap` once `min` is fixed, so negative labels get
  // an inset between the category axis and the plot instead.
  const hasFixedMin =
    !settings["graph.y_axis.auto_range"] &&
    settings["graph.y_axis.min"] != null;
  const negativeDataLabelsInset = hasFixedMin ? dataLabelsWidths.negative : 0;

  const basePadding = getRowChartPadding(
    input,
    settings,
    ticksDimensions,
    dataLabelsWidths.positive,
    renderingContext,
  );

  // Shrinks the grid so ECharts' centred bands land where visx's did.
  const bandPadding = ROW_CHART_STYLE.bandOuterPadding;
  const gridHeight = height - basePadding.top - basePadding.bottom;
  const legacyBandStep =
    gridHeight / (Math.max(getDataset(input).length, 1) + bandPadding);
  const outerInset = (bandPadding / 2) * legacyBandStep;

  const padding = {
    ...basePadding,
    top: basePadding.top + outerInset,
    bottom: basePadding.bottom + outerInset,
    left: basePadding.left + negativeDataLabelsInset,
  };

  const bounds = getChartBounds(width, height, padding, ticksDimensions);

  return {
    ticksDimensions,
    padding,
    bounds,
    negativeDataLabelsWidth: hasFixedMin ? 0 : dataLabelsWidths.negative,
    negativeDataLabelsInset,
    // Rotated bars share the plot height, not its width.
    boundaryWidth:
      height - padding.top - padding.bottom - ticksDimensions.xTicksHeight,
    outerHeight: height,
    outerWidth: width,
    axisEnabledSetting: settings["graph.x_axis.axis_enabled"],
    panelGap: 0,
  };
};
