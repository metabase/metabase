import { isNotNull } from "metabase/lib/types";
import { X_AXIS_DATA_KEY } from "metabase/visualizations/echarts/cartesian/constants/dataset";
import { CHART_STYLE } from "metabase/visualizations/echarts/cartesian/constants/style";
import type {
  AxisFormatter,
  BaseCartesianChartModel,
  ChartDataset,
  NumericAxisScaleTransforms,
  YAxisModel,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";

import { isNumericAxis, isTimeSeriesAxis } from "../model/guards";

import type {
  ChartBoundsCoords,
  ChartMeasurements,
  Padding,
  TicksDimensions,
} from "./types";

const roundToHundredth = (value: number) => Math.ceil(value * 100) / 100;

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
  const valuesToMeasure = axisModel.extent.map(extent =>
    yAxisScaleTransforms.fromEChartsAxisValue(extent),
  );

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

  // This is a simplistic assumption to predict if ECharts will use decimal ticks.
  // It checks if all values are within -5 to 5, assuming decimals are needed for this range.
  // Note: This may not accurately reflect ECharts' internal logic for tick formatting.
  const areDecimalTicksExpected = valuesToMeasure.every(
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
  formatter: AxisFormatter,
  { measureText, fontFamily }: RenderingContext,
) => {
  if (!axisEnabledSetting) {
    return { firstXTickWidth: 0, lastXTickWidth: 0, maxXTickWidth: 0 };
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

  const firstXTickWidth = measureText(
    formatter(dataset[0][X_AXIS_DATA_KEY]),
    fontStyle,
  );
  const lastXTickWidth = measureText(
    formatter(dataset[dataset.length - 1][X_AXIS_DATA_KEY]),
    fontStyle,
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
    settings["graph.x_axis.scale"] === "ordinal";

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

export const getTicksDimensions = (
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
    const fontStyle = {
      ...CHART_STYLE.axisTicks,
      family: renderingContext.fontFamily,
    };

    const maxXTickWidth = Math.max(
      ...chartModel.dataset.map(datum =>
        renderingContext.measureText(
          chartModel.xAxisModel.formatter(datum[X_AXIS_DATA_KEY]),
          fontStyle,
        ),
      ),
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
      chartModel.xAxisModel.formatter,
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

export const getChartPadding = (
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
  ticksDimensions: TicksDimensions,
  chartWidth: number,
): Padding => {
  const padding: Padding = {
    top: CHART_STYLE.padding.y,
    left: CHART_STYLE.padding.x,
    bottom: CHART_STYLE.padding.y,
    right: CHART_STYLE.padding.x,
  };

  // Prevent data labels from being rendered outside the chart
  if (
    settings["graph.show_values"] ||
    (settings["graph.show_goal"] && settings["graph.goal_label"])
  ) {
    padding.top +=
      CHART_STYLE.seriesLabels.size + CHART_STYLE.seriesLabels.offset;
  }

  padding.bottom = ticksDimensions.xTicksHeight + CHART_STYLE.axisNameMargin;

  const yAxisNameTotalWidth =
    CHART_STYLE.axisName.size + CHART_STYLE.axisNameMargin;

  let currentBoundaryWidth =
    chartWidth -
    padding.left -
    padding.right -
    ticksDimensions.yTicksWidthLeft -
    ticksDimensions.yTicksWidthRight;

  if (chartModel.leftAxisModel?.label) {
    currentBoundaryWidth -= yAxisNameTotalWidth;
  }
  if (chartModel.rightAxisModel?.label) {
    currentBoundaryWidth -= yAxisNameTotalWidth;
  }

  const dimensionWidth = getDimensionWidth(chartModel, currentBoundaryWidth);

  const firstTickOverflow = Math.min(
    ticksDimensions.firstXTickWidth / 2 - dimensionWidth / 2 - chartWidth / 8, // don't allow overflow greater than 12.5% of the chart width
  );

  let lastTickOverflow = 0;
  if (settings["graph.x_axis.axis_enabled"] !== "rotate-45") {
    lastTickOverflow = Math.min(
      ticksDimensions.lastXTickWidth / 2 - dimensionWidth / 2 - chartWidth / 8,
    );
  }

  if (chartModel.leftAxisModel != null) {
    const normalSidePadding =
      CHART_STYLE.axisTicksMarginY +
      ticksDimensions.yTicksWidthLeft +
      yAxisNameTotalWidth;

    padding.left = Math.max(normalSidePadding, firstTickOverflow);
  }

  if (chartModel.rightAxisModel != null) {
    const normalSidePadding =
      CHART_STYLE.axisTicksMarginY +
      ticksDimensions.yTicksWidthRight +
      yAxisNameTotalWidth;

    padding.right = Math.max(normalSidePadding, lastTickOverflow);
  }

  const hasXAxisName = settings["graph.x_axis.labels_enabled"];
  if (hasXAxisName) {
    padding.bottom +=
      CHART_STYLE.axisName.size / 2 + CHART_STYLE.axisNameMargin;
  }

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
  const padding = getChartPadding(chartModel, settings, ticksDimensions, width);
  const bounds = getChartBounds(width, height, padding, ticksDimensions);

  const boundaryWidth =
    width -
    padding.left -
    padding.right -
    ticksDimensions.yTicksWidthLeft -
    ticksDimensions.yTicksWidthRight;

  return {
    ticksDimensions,
    padding,
    bounds,
    boundaryWidth,
    outerHeight: height,
    axisEnabledSetting,
  };
};
