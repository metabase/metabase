import type {
  AxisBaseOption,
  AxisBaseOptionCommon,
  CategoryAxisBaseOption,
  LogAxisBaseOption,
  TimeAxisBaseOption,
  ValueAxisBaseOption,
} from "echarts/types/src/coord/axisCommonTypes";
import type { CartesianAxisOption } from "echarts/types/src/coord/cartesian/AxisModel";
import dayjs from "dayjs";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type {
  BaseCartesianChartModel,
  CategoryXAxisModel,
  Extent,
  NumericXAxisModel,
  TimeSeriesXAxisModel,
  XAxisModel,
  YAxisModel,
} from "metabase/visualizations/echarts/cartesian/model/types";

import { CHART_STYLE } from "metabase/visualizations/echarts/cartesian/constants/style";

import { getDimensionDisplayValueGetter } from "metabase/visualizations/echarts/cartesian/model/dataset";
import type { ChartMeasurements } from "../chart-measurements/types";
import { getTimeSeriesIntervalDuration } from "../utils/timeseries";
import {
  isCategoryAxis,
  isNumericAxis,
  isTimeSeriesAxis,
} from "../model/guards";
import { TICK_CANDIDATE } from "../constants/dataset";

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
): Pick<
  AxisBaseOptionCommon,
  "name" | "nameGap" | "nameLocation" | "nameRotate" | "nameTextStyle"
> => ({
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

const getCommonDimensionAxisLabelOptions = (
  settings: ComputedVisualizationSettings,
  hasTimelineEvents: boolean,
  renderingContext: RenderingContext,
): AxisBaseOption["axisLabel"] => {
  return {
    margin:
      CHART_STYLE.axisTicksMarginX +
      (hasTimelineEvents ? CHART_STYLE.timelineEvents.height : 0),
    show: !!settings["graph.x_axis.axis_enabled"],
    rotate: getRotateAngle(settings),
    ...getTicksDefaultOption(renderingContext),
  };
};

const getCommonDimensionAxisOptions = (
  settings: ComputedVisualizationSettings,
  chartMeasurements: ChartMeasurements,
  renderingContext: RenderingContext,
) => {
  const { getColor } = renderingContext;

  const nameGap = getAxisNameGap(
    chartMeasurements.ticksDimensions.xTicksHeight,
  );

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

export const buildTimeSeriesDimensionAxis = (
  settings: ComputedVisualizationSettings,
  xAxisModel: TimeSeriesXAxisModel,
  chartMeasurements: ChartMeasurements,
  hasTimelineEvents: boolean,
  renderingContext: RenderingContext,
): TimeAxisBaseOption => {
  const defaultAxisOption = getCommonDimensionAxisOptions(
    settings,
    chartMeasurements,
    renderingContext,
  );
  const { formatter } = xAxisModel;

  const axisLabel = {
    ...getCommonDimensionAxisLabelOptions(
      settings,
      hasTimelineEvents,
      renderingContext,
    ),
    formatter: (rawValue: number) => {
      const value = dayjs(rawValue);
      const offsetMinues =
        value.utcOffset() - value.tz(xAxisModel.timezone).utcOffset();

      const timezoneAdjustedValue = value
        .add(offsetMinues, "minute")
        .format("YYYY-MM-DDTHH:mm:ss");

      if (xAxisModel.tickRenderPredicate?.(timezoneAdjustedValue) ?? true) {
        return ` ${formatter(timezoneAdjustedValue)} `; // spaces force padding between ticks
      }
      return "";
    },
  };

  return {
    type: "time",
    ...defaultAxisOption,
    boundaryGap: [0.02, 0.02],
    min: range => {
      return range.min - getTimeSeriesIntervalDuration(xAxisModel.interval) / 2;
    },
    max: range => {
      return range.max + getTimeSeriesIntervalDuration(xAxisModel.interval) / 2;
    },
    minInterval: xAxisModel.ticksMinInterval,
    maxInterval: xAxisModel.ticksMaxInterval,
    axisLabel,
  };
};

export const buildCategoryDimensionAxis = (
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
  xAxisModel: CategoryXAxisModel,
  chartMeasurements: ChartMeasurements,
  hasTimelineEvents: boolean,
  renderingContext: RenderingContext,
): CategoryAxisBaseOption => {
  const defaultAxisOption = getCommonDimensionAxisOptions(
    settings,
    chartMeasurements,
    renderingContext,
  );

  const { formatter } = xAxisModel;
  const valueGetter = getDimensionDisplayValueGetter(chartModel, settings);

  const axisLabel = {
    ...getCommonDimensionAxisLabelOptions(
      settings,
      hasTimelineEvents,
      renderingContext,
    ),
    interval: (index: number, value: string) => {
      // TODO: select nice ticks on native queries
      if (chartModel.transformedDataset[index][TICK_CANDIDATE]) {
        return true;
      }
      return false;
    },
    // Value is always converted to a string by ECharts on category scales
    formatter: (value: string) => {
      return ` ${formatter(valueGetter(value))} `; // spaces force padding between ticks
    },
  };

  return {
    type: "category",
    ...defaultAxisOption,
    axisLabel,
  };
};

// Only Scatter chart can use built-in continous numeric scales
export const buildNumericDimensionAxis = (
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
  xAxisModel: NumericXAxisModel,
  chartMeasurements: ChartMeasurements,
  hasTimelineEvents: boolean,
  renderingContext: RenderingContext,
): ValueAxisBaseOption | LogAxisBaseOption => {
  const defaultAxisOption = getCommonDimensionAxisOptions(
    settings,
    chartMeasurements,
    renderingContext,
  );

  const { formatter, axisType } = xAxisModel;
  const valueGetter = getDimensionDisplayValueGetter(chartModel, settings);

  const axisLabel = {
    ...getCommonDimensionAxisLabelOptions(
      settings,
      hasTimelineEvents,
      renderingContext,
    ),
    formatter: (value: number) => {
      return ` ${formatter(valueGetter(value))} `; // spaces force padding between ticks
    },
  };

  return {
    type: axisType,
    ...defaultAxisOption,
    axisLabel,
  };
};

export const buildDimensionAxis = (
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
  xAxisModel: XAxisModel,
  chartMeasurements: ChartMeasurements,
  hasTimelineEvents: boolean,
  renderingContext: RenderingContext,
): AxisBaseOption => {
  if (isTimeSeriesAxis(xAxisModel)) {
    return buildTimeSeriesDimensionAxis(
      settings,
      xAxisModel,
      chartMeasurements,
      hasTimelineEvents,
      renderingContext,
    );
  }

  if (isCategoryAxis(xAxisModel)) {
    return buildCategoryDimensionAxis(
      chartModel,
      settings,
      xAxisModel,
      chartMeasurements,
      hasTimelineEvents,
      renderingContext,
    );
  }

  if (isNumericAxis(xAxisModel)) {
    return buildNumericDimensionAxis(
      chartModel,
      settings,
      xAxisModel,
      chartMeasurements,
      hasTimelineEvents,
      renderingContext,
    );
  }

  throw new Error(
    `Unknown axis type of the axis model ${JSON.stringify(xAxisModel)}`,
  );
};

export const buildMetricAxis = (
  axisModel: YAxisModel,
  ticksWidth: number,
  settings: ComputedVisualizationSettings,
  position: "left" | "right",
  hasSplitLine: boolean,
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
    splitLine: hasSplitLine
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
      formatter: value => axisModel.formatter(value),
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
  chartMeasurements: ChartMeasurements,
  settings: ComputedVisualizationSettings,
  hasTimelineEvents: boolean,
  renderingContext: RenderingContext,
) => {
  return {
    xAxis: buildDimensionAxis(
      chartModel,
      settings,
      chartModel.xAxisModel,
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
