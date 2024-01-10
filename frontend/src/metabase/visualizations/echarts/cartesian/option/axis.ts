import type { AxisBaseOptionCommon } from "echarts/types/src/coord/axisCommonTypes";
import type { CartesianAxisOption } from "echarts/types/src/coord/cartesian/AxisModel";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type {
  AxisFormatter,
  CartesianChartModel,
  Extent,
  YAxisModel,
} from "metabase/visualizations/echarts/cartesian/model/types";

import { CHART_STYLE } from "metabase/visualizations/echarts/cartesian/constants/style";

import { getDimensionDisplayValueGetter } from "metabase/visualizations/echarts/cartesian/model/dataset";
import type { ChartMeasurements } from "metabase/visualizations/echarts/cartesian/option/types";

const NORMALIZED_RANGE = { min: 0, max: 1 };

const getAxisNameGap = (ticksWidth: number): number => {
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
    const defaultRange = isNormalized ? NORMALIZED_RANGE : {};
    return [defaultRange, defaultRange];
  }

  const customMin = settings["graph.y_axis.min"];
  const customMax = settings["graph.y_axis.max"];

  return axisModel.extent
    ? getCustomAxisRange(axisModel.extent, customMin, customMax)
    : {};
};

const getAxisNameDefaultOption = (
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

const getTicksDefaultOption = ({ getColor, fontFamily }: RenderingContext) => {
  return {
    hideOverlap: true,
    color: getColor("text-dark"),
    fontSize: CHART_STYLE.axisTicks.size,
    fontWeight: CHART_STYLE.axisTicks.weight,
    fontFamily,
  };
};

export const getXAxisType = (settings: ComputedVisualizationSettings) => {
  switch (settings["graph.x_axis.scale"]) {
    case "timeseries":
      return "time";
    case "linear":
    case "pow":
      return "value";
    case "log":
      return "log";
    // ^ pow and log are only for scatter plot
    default:
      return "category";
  }
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

export const buildDimensionAxis = (
  chartModel: CartesianChartModel,
  settings: ComputedVisualizationSettings,
  formatter: AxisFormatter,
  chartMeasurements: ChartMeasurements,
  hasTimelineEvents: boolean,
  renderingContext: RenderingContext,
): CartesianAxisOption => {
  const { getColor } = renderingContext;
  const axisType = getXAxisType(settings);

  const boundaryGap =
    axisType === "value" || axisType === "log"
      ? undefined
      : ([0.02, 0.02] as [number, number]);

  const nameGap = getAxisNameGap(
    chartMeasurements.ticksDimensions.xTicksHeight,
  );
  const valueGetter = getDimensionDisplayValueGetter(chartModel, settings);

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
    boundaryGap,
    splitLine: {
      show: false,
    },
    type: axisType,
    axisLabel: {
      margin:
        CHART_STYLE.axisTicksMarginX +
        (hasTimelineEvents ? CHART_STYLE.timelineEvents.height : 0),
      show: !!settings["graph.x_axis.axis_enabled"],
      rotate: getRotateAngle(settings),
      ...getTicksDefaultOption(renderingContext),
      // Value is always converted to a string by ECharts
      formatter: (value: string) => ` ${formatter(valueGetter(value))} `, // spaces force padding between ticks
    },
    axisLine: {
      show: !!settings["graph.x_axis.axis_enabled"],
      lineStyle: {
        color: getColor("text-dark"),
      },
    },
  };
};

export const buildMetricAxis = (
  axisModel: YAxisModel,
  ticksWidth: number,
  settings: ComputedVisualizationSettings,
  position: "left" | "right",
  renderingContext: RenderingContext,
): CartesianAxisOption => {
  const shouldFlipAxisName = position === "right";
  const nameGap = getAxisNameGap(ticksWidth);

  const range = getYAxisRange(axisModel, settings);
  const axisType = settings["graph.y_axis.scale"] === "log" ? "log" : "value";

  return {
    type: axisType,
    ...range,
    ...getAxisNameDefaultOption(
      renderingContext,
      nameGap,
      axisModel.label,
      shouldFlipAxisName ? -90 : undefined,
    ),
    splitLine: {
      lineStyle: {
        type: 5,
        color: renderingContext.getColor("border"),
      },
    },
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
      formatter: value => axisModel.formatter(value),
    },
  };
};

const buildMetricsAxes = (
  chartModel: CartesianChartModel,
  settings: ComputedVisualizationSettings,
  chartMeasurements: ChartMeasurements,
  renderingContext: RenderingContext,
): CartesianAxisOption[] => {
  const axes: CartesianAxisOption[] = [];

  if (chartModel.leftAxisModel != null) {
    axes.push(
      buildMetricAxis(
        chartModel.leftAxisModel,
        chartMeasurements.ticksDimensions.yTicksWidthLeft,
        settings,
        "left",
        renderingContext,
      ),
    );
  }

  if (chartModel.rightAxisModel != null) {
    axes.push(
      buildMetricAxis(
        chartModel.rightAxisModel,
        chartMeasurements.ticksDimensions.yTicksWidthRight,
        settings,
        "right",
        renderingContext,
      ),
    );
  }

  return axes;
};

export const buildAxes = (
  chartModel: CartesianChartModel,
  settings: ComputedVisualizationSettings,
  chartMeasurements: ChartMeasurements,
  hasTimelineEvents: boolean,
  renderingContext: RenderingContext,
) => {
  return {
    xAxis: buildDimensionAxis(
      chartModel,
      settings,
      chartModel.xAxisModel.formatter,
      chartMeasurements,
      hasTimelineEvents,
      renderingContext,
    ),
    yAxis: buildMetricsAxes(
      chartModel,
      settings,
      chartMeasurements,
      renderingContext,
    ),
  };
};
