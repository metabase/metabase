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

import { isTimeSeriesAxis } from "../model/guards";
import { getAutoAxisEnabledSetting } from "../utils/axis";

import type {
  ChartBoundsCoords,
  ChartMeasurements,
  Padding,
  TicksDimensions,
} from "./types";

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

  const measuredValues = valuesToMeasure.map(value => {
    const formattedValue = axisModel.formatter(
      areDecimalTicksExpected ? value : Math.round(value),
    );
    return measureText(formattedValue, fontStyle);
  });

  return Math.max(...measuredValues);
};

const getXAxisTicksWidth = (
  dataset: ChartDataset,
  settings: ComputedVisualizationSettings,
  formatter: AxisFormatter,
  { measureText, fontFamily }: RenderingContext,
) => {
  const axisEnabledSetting = settings["graph.x_axis.axis_enabled"];

  if (!axisEnabledSetting) {
    return { firstXTickWidth: 0, lastXTickWidth: 0, maxXTickWidth: 0 };
  }
  if (axisEnabledSetting === "rotate-90") {
    return {
      firstXTickWidth: CHART_STYLE.axisTicks.size,
      lastXTickWidth: CHART_STYLE.axisTicks.size,
      maxXTickWidth: CHART_STYLE.axisTicks.size,
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
  const maxXTickWidth = Math.max(
    ...dataset.map(datum =>
      measureText(formatter(datum[X_AXIS_DATA_KEY]), fontStyle),
    ),
  );

  if (axisEnabledSetting === "rotate-45") {
    return {
      firstXTickWidth: firstXTickWidth / Math.SQRT2,
      lastXTickWidth: lastXTickWidth / Math.SQRT2,
      maxXTickWidth: maxXTickWidth / Math.SQRT2,
    };
  }

  return { firstXTickWidth, lastXTickWidth, maxXTickWidth };
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
    maxXTickWidth: 0,
    minXTickSpacing: 0,
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

  ticksDimensions.minXTickSpacing = getMinXTickSpacing(
    chartModel.dataset,
    settings,
    currentBoundaryWidth,
    chartModel.xAxisModel.formatter,
    renderingContext,
  );

  const isTimeSeries = isTimeSeriesAxis(chartModel.xAxisModel);
  const hasBottomAxis = !!settings["graph.x_axis.axis_enabled"];
  if (hasBottomAxis) {
    const { firstXTickWidth, lastXTickWidth, maxXTickWidth } =
      getXAxisTicksWidth(
        chartModel.transformedDataset,
        settings,
        chartModel.xAxisModel.formatter,
        renderingContext,
      );
    ticksDimensions.firstXTickWidth = firstXTickWidth;
    ticksDimensions.lastXTickWidth = lastXTickWidth;
    ticksDimensions.maxXTickWidth = maxXTickWidth;

    const axisEnabledSetting = getAutoAxisEnabledSetting(
      ticksDimensions.minXTickSpacing,
      maxXTickWidth,
      outerHeight,
      settings,
    );

    ticksDimensions.xTicksHeight =
      getXAxisTicksHeight(maxXTickWidth, axisEnabledSetting) +
      CHART_STYLE.axisTicksMarginX +
      (isTimeSeries && hasTimelineEvents
        ? CHART_STYLE.timelineEvents.height
        : 0);
  }

  return ticksDimensions;
};

const getExtraSidePadding = (
  xAxisTickOverflow: number,
  yAxisNameTotalWidth: number,
  yAxisModel: YAxisModel | null,
) => {
  const nameWidth = yAxisModel?.label != null ? yAxisNameTotalWidth : 0;
  return Math.max(xAxisTickOverflow, nameWidth);
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

  const dimensionWidth =
    currentBoundaryWidth / chartModel.transformedDataset.length;

  const firstTickOverflow = Math.min(
    ticksDimensions.firstXTickWidth / 2 -
      dimensionWidth / 2 -
      ticksDimensions.yTicksWidthLeft,
    chartWidth / 8, // don't allow overflow greater than 12.5% of the chart width
  );

  let lastTickOverflow = 0;
  if (settings["graph.x_axis.axis_enabled"] !== "rotate-45") {
    lastTickOverflow = Math.min(
      ticksDimensions.lastXTickWidth / 2 -
        dimensionWidth / 2 -
        ticksDimensions.yTicksWidthRight,
      chartWidth / 8,
    );
  }

  padding.left += getExtraSidePadding(
    firstTickOverflow,
    yAxisNameTotalWidth,

    chartModel.leftAxisModel,
  );
  padding.right += getExtraSidePadding(
    lastTickOverflow,
    yAxisNameTotalWidth,
    chartModel.rightAxisModel,
  );

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

const getMinXTickSpacing = (
  dataset: ChartDataset,
  settings: ComputedVisualizationSettings,
  boundaryWidth: number,
  formatter: AxisFormatter,
  { measureText, fontFamily }: RenderingContext,
) => {
  const autoSelectAxisEnabled = settings["graph.x_axis.axis_enabled"] === true;
  // If the user has specified a rotation setting, we use it instead of auto
  // computing a rotation. In this case we do not need to compute the spacing
  // between x-axis ticks.
  if (!autoSelectAxisEnabled) {
    return 0;
  }
  const dimensionWidth = boundaryWidth / dataset.length;
  const fontStyle = {
    ...CHART_STYLE.axisTicks,
    family: fontFamily,
  };

  let minXTickSpacing = Infinity;
  dataset.forEach((datum, index) => {
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

    const tickSpacing = dimensionWidth - leftTickWidth / 2 - rightTickWidth / 2;
    minXTickSpacing = Math.min(minXTickSpacing, tickSpacing);
  });

  return minXTickSpacing;
};

export const getChartMeasurements = (
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
  hasTimelineEvents: boolean,
  width: number,
  height: number,
  renderingContext: RenderingContext,
): ChartMeasurements => {
  const ticksDimensions = getTicksDimensions(
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
  };
};
