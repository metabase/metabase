// Layout for row charts: a cartesian bar chart with the axes swapped.
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

  const seriesKeys = (input.seriesModels ?? [])
    .filter((series) => series.visible)
    .map((series) => series.dataKey);
  const stackedFormatter = Object.values(
    input.stackedLabelsFormatters ?? {},
  ).find((formatter) => formatter != null);
  const sum = (values: number[]) =>
    values.reduce((total, value) => total + value, 0);

  // Every value label drawn. Stacked charts label each side's total, drawn when
  // the row has a value on that side; other charts label every value.
  const labels = getDataset(input).flatMap(
    (datum): { value: number; formatter: LabelFormatter }[] => {
      if (stackedFormatter != null) {
        const values = seriesKeys
          .map((dataKey) => datum[dataKey])
          .filter((value): value is number => typeof value === "number");
        return [
          values.filter((value) => value >= 0),
          values.filter((value) => value < 0),
        ]
          .filter((side) => side.length > 0)
          .map((side) => ({ value: sum(side), formatter: stackedFormatter }));
      }

      return Object.entries(input.seriesLabelsFormatters ?? {}).flatMap(
        ([dataKey, formatter]) => {
          const value = datum[dataKey];
          return formatter != null && typeof value === "number"
            ? [{ value, formatter }]
            : [];
        },
      );
    },
  );

  const fontStyle = {
    family: fontFamily,
    weight: CHART_STYLE.seriesLabels.weight,
    size: theme.cartesian.label.fontSize,
  };
  const sideOf = (value: number) => (value < 0 ? "negative" : "positive");
  const widestOn = (side: "positive" | "negative") => {
    const widths = labels
      .filter(({ value }) => sideOf(value) === side)
      .map(({ value, formatter }) =>
        measureText(String(formatter(value)), fontStyle),
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
      dataLabelsWidth,
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

  const basePadding = getRowChartPadding(
    input,
    settings,
    ticksDimensions,
    dataLabelsWidths.positive,
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
    negativeDataLabelsWidth: dataLabelsWidths.negative,
    // Rotated bars share the plot height, not its width.
    boundaryWidth:
      height - padding.top - padding.bottom - ticksDimensions.xTicksHeight,
    outerHeight: height,
    outerWidth: width,
    axisEnabledSetting: settings["graph.x_axis.axis_enabled"],
    panelGap: 0,
  };
};
