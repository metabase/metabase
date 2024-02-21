import type {
  AxisFormatter,
  BaseCartesianChartModel,
  YAxisModel,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import { CHART_STYLE } from "metabase/visualizations/echarts/cartesian/constants/style";
import type {
  ChartBoundsCoords,
  ChartMeasurements,
  Padding,
  TicksDimensions,
} from "metabase/visualizations/echarts/cartesian/option/types";
import { X_AXIS_DATA_KEY } from "metabase/visualizations/echarts/cartesian/constants/dataset";
import { isNotNull } from "metabase/lib/types";

const getYAxisTicksWidth = (
  axisModel: YAxisModel,
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

  const valuesToMeasure = [...axisModel.extent];

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

const getXAxisTicksHeight = (
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
  formatter: AxisFormatter,
  renderingContext: RenderingContext,
) => {
  const xAxisDisplay = settings["graph.x_axis.axis_enabled"];

  if (!xAxisDisplay) {
    return 0;
  }

  if (xAxisDisplay === true || xAxisDisplay === "compact") {
    return CHART_STYLE.axisTicks.size;
  }

  const tickWidths = chartModel.dataset.map(datum => {
    return renderingContext.measureText(formatter(datum[X_AXIS_DATA_KEY]), {
      ...CHART_STYLE.axisTicks,
      family: renderingContext.fontFamily,
    });
  });

  const maxTickWidth = Math.max(...tickWidths);

  if (xAxisDisplay === "rotate-90") {
    return maxTickWidth;
  }

  if (xAxisDisplay === "rotate-45") {
    return maxTickWidth / Math.sqrt(2);
  }

  console.warn(`Unexpected "graph.x_axis.axis_enabled" value ${xAxisDisplay}`);

  return CHART_STYLE.axisTicks.size + CHART_STYLE.axisNameMargin;
};

export const getTicksDimensions = (
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
  hasTimelineEvents: boolean,
  renderingContext: RenderingContext,
) => {
  const ticksDimensions = {
    yTicksWidthLeft: 0,
    yTicksWidthRight: 0,
    xTicksHeight: 0,
  };

  if (chartModel.leftAxisModel) {
    ticksDimensions.yTicksWidthLeft =
      getYAxisTicksWidth(chartModel.leftAxisModel, settings, renderingContext) +
      CHART_STYLE.axisTicksMarginY;
  }

  if (chartModel.rightAxisModel) {
    ticksDimensions.yTicksWidthRight =
      getYAxisTicksWidth(
        chartModel.rightAxisModel,
        settings,
        renderingContext,
      ) + CHART_STYLE.axisTicksMarginY;
  }

  const hasBottomAxis = !!settings["graph.x_axis.axis_enabled"];
  if (hasBottomAxis) {
    ticksDimensions.xTicksHeight =
      getXAxisTicksHeight(
        chartModel,
        settings,
        chartModel.xAxisModel.formatter,
        renderingContext,
      ) +
      CHART_STYLE.axisTicksMarginX +
      (hasTimelineEvents ? CHART_STYLE.timelineEvents.height : 0);
  }

  return ticksDimensions;
};

export const getChartPadding = (
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
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
    CHART_STYLE.axisName.size / 2 + CHART_STYLE.axisNameMargin;

  if (chartModel.leftAxisModel?.label) {
    padding.left += yAxisNameTotalWidth;
  }
  if (chartModel.rightAxisModel?.label) {
    padding.right += yAxisNameTotalWidth;
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
    settings,
    hasTimelineEvents,
    renderingContext,
  );
  const padding = getChartPadding(chartModel, settings);
  const bounds = getChartBounds(width, height, padding, ticksDimensions);

  return {
    ticksDimensions,
    padding,
    bounds,
  };
};
