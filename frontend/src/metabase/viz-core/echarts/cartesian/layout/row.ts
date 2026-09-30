// Layout for row charts: a cartesian bar chart with the axes swapped.
import type { RowValue } from "metabase-types/api";

import type {
  ComputedVisualizationSettings,
  Padding,
  RenderingContext,
} from "../../../types";
import { X_AXIS_DATA_KEY } from "../constants/dataset";
import { CHART_STYLE } from "../constants/style";
import type { LabelFormatter } from "../model/types";

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
  const fontStyle = {
    ...CHART_STYLE.axisTicks,
    family: fontFamily,
    size: theme.cartesian.label.fontSize,
  };

  const hasCategoryTicks = settings["graph.x_axis.axis_enabled"] !== false;
  const hasMetricTicks = settings["graph.y_axis.axis_enabled"] !== false;

  const formatter = input.xAxisModel.formatter;
  const widestLabel = hasCategoryTicks
    ? getDataset(input).reduce((widest, datum) => {
        const label = String(formatter(datum[X_AXIS_DATA_KEY]));
        return Math.max(widest, measureText(label, fontStyle));
      }, 0)
    : 0;

  const cap = chartWidth * ROW_CHART_LABEL_MAX_WIDTH_RATIO;
  const isCapped = widestLabel > cap;

  return {
    yTicksWidthLeft: hasCategoryTicks
      ? Math.min(widestLabel, cap) + CHART_STYLE.axisTicksMarginY
      : 0,
    yTicksWidthRight: 0,
    xTicksHeight: hasMetricTicks ? theme.cartesian.label.fontSize : 0,
    xTickWidthCap: isCapped ? cap : Infinity,
    firstXTickWidth: 0,
    lastXTickWidth: 0,
    getXTickWidth: (text: string) => measureText(text, fontStyle),
  };
};

// Room on the right for data labels, which sit past a rotated bar's end.
const getRowChartDataLabelsWidth = (
  input: ChartLayoutInput,
  settings: ComputedVisualizationSettings,
  { measureText, fontFamily, theme }: RenderingContext,
): number => {
  if (!settings["graph.show_values"]) {
    return 0;
  }

  const fontStyle = {
    family: fontFamily,
    weight: CHART_STYLE.seriesLabels.weight,
    size: theme.cartesian.label.fontSize,
  };

  const dataset = getDataset(input);
  const measure = (value: RowValue, formatter: LabelFormatter) =>
    value == null ? 0 : measureText(String(formatter(value)), fontStyle);

  const seriesKeys = (input.seriesModels ?? [])
    .filter((series) => series.visible)
    .map((series) => series.dataKey);

  // Stacked charts label the total, which is the widest label on the row.
  const stackedFormatter = Object.values(
    input.stackedLabelsFormatters ?? {},
  ).find((formatter) => formatter != null);

  const widest = dataset.reduce((widestSoFar, datum) => {
    if (stackedFormatter != null) {
      const total = seriesKeys.reduce((sum, dataKey) => {
        const value = datum[dataKey];
        return typeof value === "number" ? sum + value : sum;
      }, 0);
      return Math.max(widestSoFar, measure(total, stackedFormatter));
    }

    return Object.entries(input.seriesLabelsFormatters ?? {}).reduce(
      (widestForDatum, [dataKey, formatter]) =>
        formatter == null
          ? widestForDatum
          : Math.max(widestForDatum, measure(datum[dataKey], formatter)),
      widestSoFar,
    );
  }, 0);

  return widest === 0 ? 0 : widest + CHART_STYLE.seriesLabels.offset;
};

// Built in row terms because every reserve in `getCartesianChartPadding`
// assumes an upright chart.
const getRowChartPadding = (
  input: ChartLayoutInput,
  settings: ComputedVisualizationSettings,
  ticksDimensions: TicksDimensions,
  renderingContext: RenderingContext,
): Padding => {
  const { fontSize } = renderingContext.theme.cartesian.label;
  const axisNameWidth = fontSize + CHART_STYLE.axisNameMargin;
  const dimensionNameWidth =
    fontSize + CHART_STYLE.rowChartAxisName.dimensionMargin;
  // Mirrors what the axis builders render as each axis's `name`.
  const hasDimensionName = Boolean(
    settings["graph.x_axis.labels_enabled"] &&
    settings["graph.x_axis.title_text"],
  );
  const hasMetricName = Boolean(input.leftAxisModel?.label);
  const hasGoalLabel = Boolean(
    settings["graph.show_goal"] && settings["graph.goal_label"],
  );

  return {
    top:
      CHART_STYLE.padding.y +
      (hasGoalLabel ? fontSize + CHART_STYLE.seriesLabels.offset : 0),
    left:
      CHART_STYLE.padding.x +
      ticksDimensions.yTicksWidthLeft +
      (hasDimensionName ? dimensionNameWidth : 0),
    bottom:
      CHART_STYLE.padding.y +
      ticksDimensions.xTicksHeight +
      (hasMetricName ? axisNameWidth : 0),
    right:
      CHART_STYLE.padding.x +
      ticksDimensions.yTicksWidthRight +
      (input.rightAxisModel?.label ? axisNameWidth : 0) +
      getRowChartDataLabelsWidth(input, settings, renderingContext),
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

  const basePadding = getRowChartPadding(
    input,
    settings,
    ticksDimensions,
    renderingContext,
  );

  // Shrinks the grid so ECharts' centred bands land where visx's did.
  const bandPadding = CHART_STYLE.series.rowBandOuterPadding;
  const gridHeight = height - basePadding.top - basePadding.bottom;
  const legacyBandStep =
    gridHeight / (Math.max(getDataset(input).length, 1) + bandPadding);
  const outerInset = (bandPadding / 2) * legacyBandStep;

  const padding = {
    ...basePadding,
    top: basePadding.top + outerInset,
    bottom: basePadding.bottom + outerInset,
  };

  const bounds = getChartBounds(width, height, padding, ticksDimensions);

  return {
    ticksDimensions,
    padding,
    bounds,
    // Rotated bars share the plot height, not its width.
    boundaryWidth:
      height - padding.top - padding.bottom - ticksDimensions.xTicksHeight,
    outerHeight: height,
    outerWidth: width,
    axisEnabledSetting: settings["graph.x_axis.axis_enabled"],
    panelGap: 0,
  };
};
