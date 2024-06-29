import _ from "underscore";

import { isNotNull } from "metabase/lib/types";
import {
  ORIGINAL_INDEX_DATA_KEY,
  X_AXIS_DATA_KEY,
} from "metabase/visualizations/echarts/cartesian/constants/dataset";
import { CHART_STYLE } from "metabase/visualizations/echarts/cartesian/constants/style";
import type {
  AxisFormatter,
  BaseCartesianChartModel,
  ChartDataset,
  NumericAxisScaleTransforms,
  StackModel,
  XAxisModel,
  YAxisModel,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import { isCategory, isDate, isNumeric } from "metabase-lib/v1/types/utils/isa";

import { isNumericAxis, isTimeSeriesAxis } from "../model/guards";

import type {
  ChartBoundsCoords,
  ChartMeasurements,
  Padding,
  TicksDimensions,
} from "./types";

const getEvenlySpacedIndices = (
  length: number,
  indicesCount: number,
): number[] => {
  if (length === 0) {
    return [];
  }

  if (length < indicesCount) {
    return _.range(length);
  }

  const result = new Set([0]);
  const lastIndex = length - 1;

  if (indicesCount > 2) {
    const step = lastIndex / (indicesCount - 1);
    for (let i = 1; i < indicesCount - 1; i++) {
      result.add(Math.round(i * step));
    }
  }

  result.add(lastIndex);

  return Array.from(result);
};

const roundToHundredth = (value: number) => Math.ceil(value * 100) / 100;

const getValuesToMeasure = (min: number, max: number): number[] => {
  if (min === max) {
    return [min];
  }

  const stepsCount = 4;
  const step = (max - min) / (stepsCount + 1);
  const middleValues = [];

  for (let i = 1; i <= stepsCount; i++) {
    middleValues.push(min + step * i);
  }

  return [...middleValues, min, max];
};

const getYAxisTicksWidth = (
  axisModel: YAxisModel,
  yAxisScaleTransforms: NumericAxisScaleTransforms,
  settings: ComputedVisualizationSettings,
  { measureText, fontFamily }: RenderingContext,
): number => {
  if (!settings["graph.y_axis.axis_enabled"]) {
    return 0;
  }

  const fontStyle = {
    ...CHART_STYLE.axisTicks,
    family: fontFamily,
  };
  // extents need to be untransformed to get the value of the tick label
  const [min, max] = axisModel.extent.map(extent =>
    yAxisScaleTransforms.fromEChartsAxisValue(extent),
  );

  const isFormattingAutoOrCompact =
    settings["graph.label_value_formatting"] !== "full";
  const valuesToMeasure = isFormattingAutoOrCompact
    ? getValuesToMeasure(min, max)
    : [min, max];

  if (!settings["graph.y_axis.auto_range"]) {
    const customRangeValues = [
      settings["graph.y_axis.min"],
      settings["graph.y_axis.max"],
    ].filter(isNotNull);

    valuesToMeasure.push(...customRangeValues);
  }

  if (settings["graph.show_goal"] && settings["graph.goal_value"] != null) {
    valuesToMeasure.push(settings["graph.goal_value"]);
  }

  // This is a simplistic assumption to predict if ECharts will use decimal
  // ticks. It checks if all values are within -5 to 5, assuming decimals are
  // needed for this range. We check the original extents, instead of the
  // untransformed values, because echarts will determine its ticks based on the
  // transformed values (which we then untransform in the formatting function).

  // Note: This may not accurately reflect ECharts' internal logic for tick
  // formatting.
  const areDecimalTicksExpected = axisModel.extent.every(
    value => value > -5 && value < 5,
  );

  const measuredValues = valuesToMeasure.map(rawValue => {
    const isPercent =
      settings.column?.(axisModel.column).number_style === "percent";

    let value = rawValue;
    if (isPercent) {
      value = roundToHundredth(rawValue);
    } else if (!areDecimalTicksExpected) {
      value = Math.round(rawValue);
    }

    const formattedValue = axisModel.formatter(value);
    return measureText(formattedValue, fontStyle);
  });

  return Math.max(...measuredValues);
};

const getXAxisTicksWidth = (
  dataset: ChartDataset,
  axisEnabledSetting: ComputedVisualizationSettings["graph.x_axis.axis_enabled"],
  axisModel: XAxisModel,
  { measureText, fontFamily }: RenderingContext,
) => {
  if (!axisEnabledSetting) {
    return { firstXTickWidth: 0, lastXTickWidth: 0 };
  }
  if (axisEnabledSetting === "rotate-90") {
    return {
      firstXTickWidth: CHART_STYLE.axisTicks.size,
      lastXTickWidth: CHART_STYLE.axisTicks.size,
    };
  }

  const fontStyle = {
    ...CHART_STYLE.axisTicks,
    family: fontFamily,
  };

  const valuesToMeasure = [0, dataset.length - 1].map(index => {
    if (isNumericAxis(axisModel)) {
      // extents need to be untransformed to get the value of the tick label
      return axisModel.fromEChartsAxisValue(
        dataset[index][X_AXIS_DATA_KEY] as number,
      );
    }
    return dataset[index][X_AXIS_DATA_KEY];
  });

  const [firstXTickWidth, lastXTickWidth] = valuesToMeasure.map(value =>
    measureText(axisModel.formatter(value), fontStyle),
  );

  if (axisEnabledSetting === "rotate-45") {
    return {
      firstXTickWidth: firstXTickWidth / Math.SQRT2,
      lastXTickWidth: lastXTickWidth / Math.SQRT2,
    };
  }

  return { firstXTickWidth, lastXTickWidth };
};

const getXAxisTicksHeight = (
  maxXTickWidth: number,
  axisEnabledSetting: ComputedVisualizationSettings["graph.x_axis.axis_enabled"],
) => {
  if (!axisEnabledSetting) {
    return 0;
  }

  if (axisEnabledSetting === true || axisEnabledSetting === "compact") {
    return CHART_STYLE.axisTicks.size;
  }

  if (axisEnabledSetting === "rotate-90") {
    return maxXTickWidth;
  }

  if (axisEnabledSetting === "rotate-45") {
    return maxXTickWidth / Math.SQRT2;
  }

  console.warn(
    `Unexpected "graph.x_axis.axis_enabled" value ${axisEnabledSetting}`,
  );

  return CHART_STYLE.axisTicks.size + CHART_STYLE.axisNameMargin;
};

const X_LABEL_HEIGHT_RATIO_THRESHOLD = 0.7; // x-axis labels cannot be taller than 70% of chart height

const checkHeight = (
  maxXTickWidth: number,
  outerHeight: number,
  rotation: "rotate-90" | "rotate-45",
) => {
  if (rotation === "rotate-90") {
    return maxXTickWidth / outerHeight < X_LABEL_HEIGHT_RATIO_THRESHOLD;
  }
  return (
    maxXTickWidth / Math.SQRT2 / outerHeight < X_LABEL_HEIGHT_RATIO_THRESHOLD
  );
};

const X_LABEL_ROTATE_45_THRESHOLD_FACTOR = 2.1;
const X_LABEL_ROTATE_90_THRESHOLD_FACTOR = 1.2;

const getAutoAxisEnabledSetting = (
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
  boundaryWidth: number,
  maxXTickWidth: number,
  outerHeight: number,
  renderingContext: RenderingContext,
): ComputedVisualizationSettings["graph.x_axis.axis_enabled"] => {
  const shouldAutoSelectSetting =
    settings["graph.x_axis.axis_enabled"] === true &&
    (settings["graph.x_axis.scale"] === "ordinal" ||
      settings["graph.x_axis.scale"] === "histogram");

  if (!shouldAutoSelectSetting) {
    return settings["graph.x_axis.axis_enabled"];
  }

  const dimensionWidth = getDimensionWidth(chartModel, boundaryWidth);
  const shouldRotate = areHorizontalXAxisTicksOverlapping(
    chartModel.transformedDataset,
    dimensionWidth,
    chartModel.xAxisModel.formatter,
    renderingContext,
  );

  if (!shouldRotate) {
    return true;
  }

  if (
    dimensionWidth >=
    CHART_STYLE.axisTicks.size * X_LABEL_ROTATE_45_THRESHOLD_FACTOR
  ) {
    return checkHeight(maxXTickWidth, outerHeight, "rotate-45")
      ? "rotate-45"
      : false;
  }

  if (
    dimensionWidth >=
    CHART_STYLE.axisTicks.size * X_LABEL_ROTATE_90_THRESHOLD_FACTOR
  ) {
    return checkHeight(maxXTickWidth, outerHeight, "rotate-90")
      ? "rotate-90"
      : false;
  }

  return false;
};

const X_TICKS_TO_MEASURE_COUNT = 50;

// Formatting and measuring every x-axis value can be expensive on datasets with thousands of values,
// therefore we want to reduce the number of measured ticks based on the x-axis column type and a single dimension width.
const getXTicksToMeasure = (
  chartModel: BaseCartesianChartModel,
  dimensionWidth: number,
) => {
  const dimensionColumn = chartModel.dimensionModel.column;

  // On continuous axes, we measure a limited number of evenly spaced ticks, including the start and end points.
  if (isNumeric(dimensionColumn) || isDate(dimensionColumn)) {
    return getEvenlySpacedIndices(
      chartModel.dataset.length,
      X_TICKS_TO_MEASURE_COUNT,
    ).map(datumIndex => chartModel.dataset[datumIndex][X_AXIS_DATA_KEY]);
  }

  // On category scales, when the dimension width is smaller than the tick font size,
  // meaning that even with 90-degree rotation the ticks will not fit,
  // we select the top N ticks based on character length for formatting and measurement.
  if (
    isCategory(dimensionColumn) &&
    dimensionWidth <= CHART_STYLE.axisTicks.size
  ) {
    return chartModel.dataset
      .map(datum => datum[X_AXIS_DATA_KEY])
      .sort((a, b) => String(b).length - String(a).length)
      .slice(0, X_TICKS_TO_MEASURE_COUNT);
  }

  return chartModel.dataset.map(datum => datum[X_AXIS_DATA_KEY]);
};

const getMaxXTickWidth = (
  chartModel: BaseCartesianChartModel,
  dimensionWidth: number,
  renderingContext: RenderingContext,
) => {
  const valueToMeasure = getXTicksToMeasure(chartModel, dimensionWidth);

  const fontStyle = {
    ...CHART_STYLE.axisTicks,
    family: renderingContext.fontFamily,
  };

  return Math.max(
    ...valueToMeasure.map(value =>
      renderingContext.measureText(
        chartModel.xAxisModel.formatter(value),
        fontStyle,
      ),
    ),
  );
};

const getTicksDimensions = (
  chartModel: BaseCartesianChartModel,
  chartWidth: number,
  outerHeight: number,
  settings: ComputedVisualizationSettings,
  hasTimelineEvents: boolean,
  renderingContext: RenderingContext,
) => {
  const ticksDimensions: TicksDimensions = {
    yTicksWidthLeft: 0,
    yTicksWidthRight: 0,
    xTicksHeight: 0,
    firstXTickWidth: 0,
    lastXTickWidth: 0,
  };

  if (chartModel.leftAxisModel) {
    ticksDimensions.yTicksWidthLeft =
      getYAxisTicksWidth(
        chartModel.leftAxisModel,
        chartModel.yAxisScaleTransforms,
        settings,
        renderingContext,
      ) + CHART_STYLE.axisTicksMarginY;
  }

  if (chartModel.rightAxisModel) {
    ticksDimensions.yTicksWidthRight =
      getYAxisTicksWidth(
        chartModel.rightAxisModel,
        chartModel.yAxisScaleTransforms,
        settings,
        renderingContext,
      ) + CHART_STYLE.axisTicksMarginY;
  }

  const currentBoundaryWidth =
    chartWidth -
    CHART_STYLE.padding.x * 2 -
    ticksDimensions.yTicksWidthLeft -
    ticksDimensions.yTicksWidthRight;

  const isTimeSeries = isTimeSeriesAxis(chartModel.xAxisModel);
  let axisEnabledSetting = settings["graph.x_axis.axis_enabled"];
  const hasBottomAxis = !!axisEnabledSetting;

  if (hasBottomAxis) {
    const dimensionWidth = getDimensionWidth(chartModel, currentBoundaryWidth);

    const maxXTickWidth = getMaxXTickWidth(
      chartModel,
      dimensionWidth,
      renderingContext,
    );

    axisEnabledSetting = getAutoAxisEnabledSetting(
      chartModel,
      settings,
      currentBoundaryWidth,
      maxXTickWidth,
      outerHeight,
      renderingContext,
    );

    const { firstXTickWidth, lastXTickWidth } = getXAxisTicksWidth(
      chartModel.transformedDataset,
      axisEnabledSetting,
      chartModel.xAxisModel,
      renderingContext,
    );
    ticksDimensions.firstXTickWidth = firstXTickWidth;
    ticksDimensions.lastXTickWidth = lastXTickWidth;

    ticksDimensions.xTicksHeight =
      getXAxisTicksHeight(maxXTickWidth, axisEnabledSetting) +
      CHART_STYLE.axisTicksMarginX +
      (isTimeSeries && hasTimelineEvents
        ? CHART_STYLE.timelineEvents.height
        : 0);
  }

  return { ticksDimensions, axisEnabledSetting };
};

// The buffer is needed because in some cases the last x-axis tick that echarts
// uses can be much wider than what we estimated. For example, with a log x-axis
// scale on a dataset where dimension values range from 0 to 255, the string we use
// to estimate the last tick width is "255". However, echarts will add an extra x-axis
// tick, and after untransforming it (e.g. undoing the log) that last tick will be
// "1,000", which is significantly longer than "255".
const TICK_OVERFLOW_BUFFER = 4;

export const getChartPadding = (
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
  ticksDimensions: TicksDimensions,
  axisEnabledSetting: ComputedVisualizationSettings["graph.x_axis.axis_enabled"],
  chartWidth: number,
): Padding => {
  const padding: Padding = {
    top: CHART_STYLE.padding.y,
    left: CHART_STYLE.padding.x,
    bottom: CHART_STYLE.padding.y,
    right: CHART_STYLE.padding.x,
  };

  // 1. Top Padding

  // Prevent data labels from being rendered outside the chart
  if (
    settings["graph.show_values"] ||
    (settings["graph.show_goal"] && settings["graph.goal_label"])
  ) {
    padding.top +=
      CHART_STYLE.seriesLabels.size + CHART_STYLE.seriesLabels.offset;
  }

  // 2. Bottom Padding

  padding.bottom += ticksDimensions.xTicksHeight;

  const hasXAxisName = settings["graph.x_axis.labels_enabled"];
  if (hasXAxisName) {
    padding.bottom +=
      CHART_STYLE.axisName.size / 2 + CHART_STYLE.axisNameMargin;
  }

  // 3. Side (Left and Right) Padding

  const yAxisNameTotalWidth =
    CHART_STYLE.axisName.size + CHART_STYLE.axisNameMargin;

  padding.left += ticksDimensions.yTicksWidthLeft;
  if (chartModel.leftAxisModel?.label) {
    padding.left += yAxisNameTotalWidth;
  }

  padding.right += ticksDimensions.yTicksWidthRight;
  if (chartModel.rightAxisModel?.label) {
    padding.right += yAxisNameTotalWidth;
  }

  const maxOverflow = chartWidth / 8; // don't allow overflow greater than 12.5% of the chart width
  let firstTickOverflow: number;
  let lastTickOverflow: number;

  // We handle non-categorical scatter plots differently, because echarts places
  // the tick labels on the very edge of the x-axis for scatter plots only.
  const isScatterPlot = chartModel.seriesModels.some(seriesModel => {
    const seriesSettings = settings.series(
      seriesModel.legacySeriesSettingsObjectKey,
    );
    return seriesSettings.display === "scatter";
  });
  if (isScatterPlot && chartModel.xAxisModel.axisType !== "category") {
    firstTickOverflow = Math.min(
      Math.max(
        ticksDimensions.firstXTickWidth / 2 -
          padding.left +
          TICK_OVERFLOW_BUFFER,
        0,
      ),
      maxOverflow,
    );
    lastTickOverflow = Math.min(
      Math.max(
        ticksDimensions.lastXTickWidth / 2 -
          padding.right +
          TICK_OVERFLOW_BUFFER,
        0,
      ),
      maxOverflow,
    );
  } else {
    const currentBoundaryWidth = chartWidth - padding.left - padding.right;
    const dimensionWidth = getDimensionWidth(chartModel, currentBoundaryWidth);

    firstTickOverflow = Math.min(
      Math.max(
        ticksDimensions.firstXTickWidth / 2 -
          dimensionWidth / 2 -
          padding.left +
          TICK_OVERFLOW_BUFFER,
        0,
      ),
      maxOverflow,
    );
    lastTickOverflow = 0;
    if (axisEnabledSetting !== "rotate-45") {
      lastTickOverflow = Math.min(
        Math.max(
          ticksDimensions.lastXTickWidth / 2 -
            dimensionWidth / 2 -
            padding.right +
            TICK_OVERFLOW_BUFFER,
          0,
        ),
        maxOverflow,
      );
    }
  }

  padding.left += firstTickOverflow;
  padding.right += lastTickOverflow;

  return padding;
};

export const getChartBounds = (
  width: number,
  height: number,
  padding: Padding,
  ticksDimensions: TicksDimensions,
): ChartBoundsCoords => {
  return {
    top: padding.top,
    bottom: height - padding.bottom - ticksDimensions.xTicksHeight,
    left: padding.left + ticksDimensions.yTicksWidthLeft,
    right: width - padding.right - ticksDimensions.yTicksWidthRight,
  };
};

const getDimensionWidth = (
  chartModel: BaseCartesianChartModel,
  boundaryWidth: number,
) => {
  const { xAxisModel } = chartModel;
  const xValuesCount =
    isTimeSeriesAxis(xAxisModel) || isNumericAxis(xAxisModel)
      ? xAxisModel.intervalsCount + 1
      : xAxisModel.valuesCount;

  return boundaryWidth / xValuesCount;
};

const HORIZONTAL_TICKS_GAP = 6;

const areHorizontalXAxisTicksOverlapping = (
  dataset: ChartDataset,
  dimensionWidth: number,
  formatter: AxisFormatter,
  { measureText, fontFamily }: RenderingContext,
) => {
  const fontStyle = {
    ...CHART_STYLE.axisTicks,
    family: fontFamily,
  };

  return dataset.some((datum, index) => {
    if (index === 0) {
      return;
    }
    const prevDatum = dataset[index - 1];
    const leftTickWidth = measureText(
      formatter(datum[X_AXIS_DATA_KEY]),
      fontStyle,
    );
    const rightTickWidth = measureText(
      formatter(prevDatum[X_AXIS_DATA_KEY]),
      fontStyle,
    );

    return (
      leftTickWidth / 2 + rightTickWidth / 2 + HORIZONTAL_TICKS_GAP >
      dimensionWidth
    );
  });
};

const countFittingLabels = (
  chartModel: BaseCartesianChartModel,
  barStack: StackModel,
  barWidth: number,
  renderingContext: RenderingContext,
) => {
  return barStack.seriesKeys.reduce(
    (fitCounts, seriesKey) => {
      const formatter = chartModel.seriesLabelsFormatters?.[seriesKey];
      if (!formatter) {
        return fitCounts;
      }

      const seriesFitCounts = chartModel.transformedDataset.reduce(
        (fitCounts, datum, index) => {
          const datumIndex = datum[ORIGINAL_INDEX_DATA_KEY] ?? index;
          const value =
            datumIndex != null
              ? chartModel.dataset[datumIndex][seriesKey]
              : null;

          // Nulls and zeros should not be considered because they can't have labels
          if (value == null || value === 0) {
            return fitCounts;
          }

          const valueWidth = renderingContext.measureText(formatter(value), {
            weight: CHART_STYLE.seriesLabels.weight,
            size: CHART_STYLE.seriesLabels.size,
            family: renderingContext.fontFamily,
          });

          const canFitHorizontally =
            valueWidth + 2 * CHART_STYLE.seriesLabels.stackedPadding < barWidth;

          if (canFitHorizontally) {
            fitCounts.horizontalFitCount += 1;
          }
          fitCounts.valuesCount += 1;

          return fitCounts;
        },
        { horizontalFitCount: 0, valuesCount: 0 },
      );

      fitCounts.valuesCount += seriesFitCounts.valuesCount;
      fitCounts.horizontalFitCount += seriesFitCounts.horizontalFitCount;

      return fitCounts;
    },
    { horizontalFitCount: 0, valuesCount: 0 },
  );
};

const BAR_WIDTH_PRECISION = 0.85;
const HORIZONTAL_LABELS_COUNT_THRESHOLD = 0.8;

const getStackedBarTicksRotation = (
  chartModel: BaseCartesianChartModel,
  boundaryWidth: number,
  renderingContext: RenderingContext,
) => {
  const barStack = chartModel.stackModels.find(
    stackModel => stackModel.display === "bar",
  );

  if (!barStack) {
    return;
  }

  const barWidth =
    getDimensionWidth(chartModel, boundaryWidth) *
    CHART_STYLE.series.barWidth *
    BAR_WIDTH_PRECISION;

  if (barWidth < CHART_STYLE.seriesLabels.size) {
    return;
  }

  const labelsFit = countFittingLabels(
    chartModel,
    barStack,
    barWidth,
    renderingContext,
  );

  if (labelsFit.valuesCount === 0) {
    return;
  }

  // We prefer horizontal labels as they are easier to read.
  // If we can't display a sufficient number of horizontal labels, we will try rendering them rotated.
  return labelsFit.horizontalFitCount / labelsFit.valuesCount >=
    HORIZONTAL_LABELS_COUNT_THRESHOLD
    ? "horizontal"
    : "vertical";
};

export const getChartMeasurements = (
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
  hasTimelineEvents: boolean,
  width: number,
  height: number,
  renderingContext: RenderingContext,
): ChartMeasurements => {
  const { ticksDimensions, axisEnabledSetting } = getTicksDimensions(
    chartModel,
    width,
    height,
    settings,
    hasTimelineEvents,
    renderingContext,
  );
  const padding = getChartPadding(
    chartModel,
    settings,
    ticksDimensions,
    axisEnabledSetting,
    width,
  );
  const bounds = getChartBounds(width, height, padding, ticksDimensions);

  const boundaryWidth =
    width -
    padding.left -
    padding.right -
    ticksDimensions.yTicksWidthLeft -
    ticksDimensions.yTicksWidthRight;

  const stackedBarTicksRotation = getStackedBarTicksRotation(
    chartModel,
    boundaryWidth,
    renderingContext,
  );

  return {
    ticksDimensions,
    padding,
    bounds,
    boundaryWidth,
    outerHeight: height,
    axisEnabledSetting,
    stackedBarTicksRotation,
  };
};
