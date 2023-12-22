import type {
  AxisFormatter,
  CartesianChartModel,
  YAxisModel,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import { CHART_STYLE } from "metabase/visualizations/echarts/cartesian/constants/style";
import type {
  ChartMeasurements,
  Padding,
} from "metabase/visualizations/echarts/cartesian/option/types";

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
    ].filter(value => typeof value === "number");

    valuesToMeasure.push(...customRangeValues);
  }

  if (!settings["graph.y_axis.auto_range"]) {
    const customRangeValues = [
      settings["graph.y_axis.min"],
      settings["graph.y_axis.max"],
    ].filter(value => typeof value === "number");

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
  chartModel: CartesianChartModel,
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
    return renderingContext.measureText(
      formatter(datum[chartModel.dimensionModel.dataKey]),
      {
        ...CHART_STYLE.axisTicks,
        family: renderingContext.fontFamily,
      },
    );
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
  chartModel: CartesianChartModel,
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
  chartModel: CartesianChartModel,
  settings: ComputedVisualizationSettings,
): Padding => {
  const padding: Padding = {
    top: CHART_STYLE.padding.y,
    left: CHART_STYLE.padding.x,
    bottom: CHART_STYLE.padding.y,
    right: CHART_STYLE.padding.x,
  };

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

export const getChartMeasurements = (
  chartModel: CartesianChartModel,
  settings: ComputedVisualizationSettings,
  hasTimelineEvents: boolean,
  renderingContext: RenderingContext,
): ChartMeasurements => {
  const ticksDimensions = getTicksDimensions(
    chartModel,
    settings,
    hasTimelineEvents,
    renderingContext,
  );
  const padding = getChartPadding(chartModel, settings);

  return {
    ticksDimensions,
    padding,
  };
};
