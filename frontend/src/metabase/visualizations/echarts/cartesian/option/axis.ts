import type {
  AxisBaseOption,
  AxisBaseOptionCommon,
  CategoryAxisBaseOption,
  TimeAxisBaseOption,
  ValueAxisBaseOption,
} from "echarts/types/src/coord/axisCommonTypes";
import type { CartesianAxisOption } from "echarts/types/src/coord/cartesian/AxisModel";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type {
  BaseCartesianChartModel,
  Extent,
  NumericAxisScaleTransforms,
  NumericXAxisModel,
  TimeSeriesXAxisModel,
  YAxisModel,
} from "metabase/visualizations/echarts/cartesian/model/types";

import { CHART_STYLE } from "metabase/visualizations/echarts/cartesian/constants/style";

import type { ChartMeasurements } from "../chart-measurements/types";
import { isNumericAxis, isTimeSeriesAxis } from "../model/guards";
import { getTicksOptions } from "./ticks";

const NORMALIZED_RANGE = { min: 0, max: 1 };

export const getAxisNameGap = (ticksWidth: number): number => {
  return ticksWidth + CHART_STYLE.axisNameMargin;
};

const getCustomAxisRange = (
  axisExtent: Extent,
  min: number | undefined,
  max: number | undefined,
) => {
  const [extentMin, extentMax] = axisExtent;
  // if min/max are not specified or within series extents return `undefined`
  // so that ECharts compute a rounded range automatically
  const finalMin = min != null && min < extentMin ? min : undefined;
  const finalMax = max != null && max > extentMax ? max : undefined;

  return { min: finalMin, max: finalMax };
};

export const getYAxisRange = (
  axisModel: YAxisModel,
  settings: ComputedVisualizationSettings,
) => {
  const isNormalized = settings["stackable.stack_type"] === "normalized";
  const isAutoRangeEnabled = settings["graph.y_axis.auto_range"];

  if (isAutoRangeEnabled) {
    return isNormalized ? NORMALIZED_RANGE : {};
  }

  const customMin = settings["graph.y_axis.min"];
  const customMax = settings["graph.y_axis.max"];

  return axisModel.extent
    ? getCustomAxisRange(axisModel.extent, customMin, customMax)
    : {};
};

export const getAxisNameDefaultOption = (
  { getColor, fontFamily }: RenderingContext,
  nameGap: number,
  name: string | undefined,
  rotate?: number,
): Partial<AxisBaseOptionCommon> => ({
  name,
  nameGap,
  nameLocation: "middle",
  nameRotate: rotate,
  nameTextStyle: {
    color: getColor("text-dark"),
    fontSize: CHART_STYLE.axisName.size,
    fontWeight: CHART_STYLE.axisName.weight,
    fontFamily,
  },
});

export const getTicksDefaultOption = ({
  getColor,
  fontFamily,
}: RenderingContext) => {
  return {
    hideOverlap: true,
    color: getColor("text-dark"),
    fontSize: CHART_STYLE.axisTicks.size,
    fontWeight: CHART_STYLE.axisTicks.weight,
    fontFamily,
  };
};

export const getDimensionTicksDefaultOption = (
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
) => {
  return {
    ...getTicksDefaultOption(renderingContext),
    show: !!settings["graph.x_axis.axis_enabled"],
    rotate: getRotateAngle(settings),
  };
};

const getHistogramTicksOptions = (
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
  chartMeasurements: ChartMeasurements,
) => {
  if (settings["graph.x_axis.scale"] !== "histogram") {
    return {};
  }

  const histogramDimensionWidth =
    chartMeasurements.boundaryWidth / chartModel.transformedDataset.length;

  return {
    padding: [0, histogramDimensionWidth, 0, 0],
    showMinLabel: false,
    showMaxLabel: true,
  };
};

const getRotateAngle = (settings: ComputedVisualizationSettings) => {
  switch (settings["graph.x_axis.axis_enabled"]) {
    case "rotate-45":
      return 45;
    case "rotate-90":
      return 90;
    default:
      return undefined;
  }
};

const getCommonDimensionAxisOptions = (
  chartMeasurements: ChartMeasurements,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
) => {
  const nameGap = getAxisNameGap(
    chartMeasurements.ticksDimensions.xTicksHeight,
  );
  const { getColor } = renderingContext;
  return {
    ...getAxisNameDefaultOption(
      renderingContext,
      nameGap,
      settings["graph.x_axis.labels_enabled"]
        ? settings["graph.x_axis.title_text"]
        : undefined,
    ),
    axisTick: {
      show: false,
    },
    splitLine: {
      show: false,
    },
    axisLine: {
      show: !!settings["graph.x_axis.axis_enabled"],
      lineStyle: {
        color: getColor("border"),
      },
    },
  };
};

export const buildDimensionAxis = (
  chartModel: BaseCartesianChartModel,
  width: number,
  settings: ComputedVisualizationSettings,
  chartMeasurements: ChartMeasurements,
  hasTimelineEvents: boolean,
  renderingContext: RenderingContext,
): AxisBaseOption => {
  const xAxisModel = chartModel.xAxisModel;

  if (isNumericAxis(xAxisModel)) {
    return buildNumericDimensionAxis(
      xAxisModel,
      settings,
      chartMeasurements,
      renderingContext,
    );
  }

  if (isTimeSeriesAxis(xAxisModel)) {
    return buildTimeSeriesDimensionAxis(
      xAxisModel,
      width,
      hasTimelineEvents,
      settings,
      chartMeasurements,
      renderingContext,
    );
  }

  return buildCategoricalDimensionAxis(
    chartModel,
    settings,
    chartMeasurements,
    renderingContext,
  );
};

export const buildNumericDimensionAxis = (
  xAxisModel: NumericXAxisModel,
  settings: ComputedVisualizationSettings,
  chartMeasurements: ChartMeasurements,
  renderingContext: RenderingContext,
): ValueAxisBaseOption => {
  const {
    fromEChartsAxisValue: fromAxisValue,
    isPadded,
    extent,
    interval,
    ticksMaxInterval,
    formatter,
  } = xAxisModel;

  const [min, max] = extent;
  const axisPadding = interval / 2;

  return {
    ...getCommonDimensionAxisOptions(
      chartMeasurements,
      settings,
      renderingContext,
    ),
    type: "value",
    scale: true,
    axisLabel: {
      margin: CHART_STYLE.axisTicksMarginX,
      ...getDimensionTicksDefaultOption(settings, renderingContext),
      formatter: (rawValue: number) => {
        if (isPadded && (rawValue < min || rawValue > max)) {
          return "";
        }
        return ` ${formatter(fromAxisValue(rawValue))} `;
      },
    },
    ...(isPadded
      ? {
          min: () => min - axisPadding,
          max: () => max + axisPadding,
        }
      : {}),
    maxInterval: ticksMaxInterval,
  };
};

export const buildTimeSeriesDimensionAxis = (
  xAxisModel: TimeSeriesXAxisModel,
  width: number,
  hasTimelineEvents: boolean,
  settings: ComputedVisualizationSettings,
  chartMeasurements: ChartMeasurements,
  renderingContext: RenderingContext,
): TimeAxisBaseOption => {
  const { formatter, maxInterval, minInterval, canRender, xDomainPadded } =
    getTicksOptions(xAxisModel, width);

  return {
    ...getCommonDimensionAxisOptions(
      chartMeasurements,
      settings,
      renderingContext,
    ),
    type: "time",
    axisLabel: {
      margin:
        CHART_STYLE.axisTicksMarginX +
        (hasTimelineEvents ? CHART_STYLE.timelineEvents.height : 0),
      ...getDimensionTicksDefaultOption(settings, renderingContext),
      formatter: (rawValue: number) => {
        const value = xAxisModel.fromAxisValue(rawValue);
        if (canRender(value)) {
          return ` ${formatter(value.format("YYYY-MM-DDTHH:mm:ss"))} `; // spaces force padding between ticks
        }
        return "";
      },
    },
    min: xDomainPadded[0],
    max: xDomainPadded[1],
    minInterval,
    maxInterval,
  };
};

export const buildCategoricalDimensionAxis = (
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
  chartMeasurements: ChartMeasurements,
  renderingContext: RenderingContext,
): CategoryAxisBaseOption => {
  const {
    xAxisModel: { formatter },
  } = chartModel;

  return {
    ...getCommonDimensionAxisOptions(
      chartMeasurements,
      settings,
      renderingContext,
    ),
    type: "category",
    axisLabel: {
      margin: CHART_STYLE.axisTicksMarginX,
      ...getDimensionTicksDefaultOption(settings, renderingContext),
      ...getHistogramTicksOptions(chartModel, settings, chartMeasurements),
      formatter: (value: string) => {
        return ` ${formatter(value)} `; // spaces force padding between ticks
      },
    },
  };
};

export const buildMetricAxis = (
  axisModel: YAxisModel,
  yAxisScaleTransforms: NumericAxisScaleTransforms,
  ticksWidth: number,
  settings: ComputedVisualizationSettings,
  position: "left" | "right",
  hasSplitLine: boolean,
  renderingContext: RenderingContext,
): CartesianAxisOption => {
  const shouldFlipAxisName = position === "right";
  const nameGap = getAxisNameGap(ticksWidth);

  const range = getYAxisRange(axisModel, settings);

  return {
    type: "value",
    ...range,
    ...getAxisNameDefaultOption(
      renderingContext,
      nameGap,
      axisModel.label,
      shouldFlipAxisName ? -90 : undefined,
    ),
    splitLine:
      hasSplitLine && !!settings["graph.y_axis.axis_enabled"]
        ? {
            lineStyle: {
              type: 5,
              color: renderingContext.getColor("border"),
            },
          }
        : undefined,
    position,
    axisLine: {
      show: false,
    },
    axisTick: {
      show: false,
    },
    axisLabel: {
      margin: CHART_STYLE.axisTicksMarginY,
      show: !!settings["graph.y_axis.axis_enabled"],
      ...getTicksDefaultOption(renderingContext),
      // @ts-expect-error TODO: figure out EChart types
      formatter: rawValue =>
        axisModel.formatter(
          yAxisScaleTransforms.fromEChartsAxisValue(rawValue),
        ),
    },
  };
};

const buildMetricsAxes = (
  chartModel: BaseCartesianChartModel,
  chartMeasurements: ChartMeasurements,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): CartesianAxisOption[] => {
  const axes: CartesianAxisOption[] = [];

  if (chartModel.leftAxisModel != null) {
    axes.push(
      buildMetricAxis(
        chartModel.leftAxisModel,
        chartModel.yAxisScaleTransforms,
        chartMeasurements.ticksDimensions.yTicksWidthLeft,
        settings,
        "left",
        true,
        renderingContext,
      ),
    );
  }

  if (chartModel.rightAxisModel != null) {
    const isOnlyAxis = chartModel.leftAxisModel == null;
    axes.push(
      buildMetricAxis(
        chartModel.rightAxisModel,
        chartModel.yAxisScaleTransforms,
        chartMeasurements.ticksDimensions.yTicksWidthRight,
        settings,
        "right",
        isOnlyAxis,
        renderingContext,
      ),
    );
  }

  return axes;
};

export const buildAxes = (
  chartModel: BaseCartesianChartModel,
  width: number,
  chartMeasurements: ChartMeasurements,
  settings: ComputedVisualizationSettings,
  hasTimelineEvents: boolean,
  renderingContext: RenderingContext,
) => {
  return {
    xAxis: buildDimensionAxis(
      chartModel,
      width,
      settings,
      chartMeasurements,
      hasTimelineEvents,
      renderingContext,
    ),
    yAxis: buildMetricsAxes(
      chartModel,
      chartMeasurements,
      settings,
      renderingContext,
    ),
  };
};
