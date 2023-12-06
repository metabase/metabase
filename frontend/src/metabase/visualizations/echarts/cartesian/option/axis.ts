// eslint-disable-next-line no-restricted-imports
import moment from "moment-timezone";
import type { AxisBaseOptionCommon } from "echarts/types/src/coord/axisCommonTypes";
import type { CartesianAxisOption } from "echarts/types/src/coord/cartesian/AxisModel";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type {
  CartesianChartModel,
  Extent,
} from "metabase/visualizations/echarts/cartesian/model/types";

import type {
  AxesFormatters,
  AxisFormatter,
  AxisRange,
} from "metabase/visualizations/echarts/cartesian/option/types";
import { CHART_STYLE } from "metabase/visualizations/echarts/cartesian/option/style";

import { getMetricDisplayValueGetter } from "metabase/visualizations/echarts/cartesian/model/dataset";
import { isNumeric } from "metabase-lib/types/utils/isa";

const NORMALIZED_RANGE = { min: 0, max: 1 };

const getYAxisTicksWidth = (
  extent: Extent,
  formatter: AxisFormatter,
  settings: ComputedVisualizationSettings,
  { measureText, fontFamily }: RenderingContext,
): number => {
  if (!settings["graph.x_axis.axis_enabled"]) {
    return 0;
  }

  const fontStyle = {
    ...CHART_STYLE.axisTicks,
    family: fontFamily,
  };

  const valuesToMeasure = [...extent];

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
    const formattedValue = formatter(
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

const getYAxisNameGap = (
  extent: Extent,
  formatter: AxisFormatter,
  settings: ComputedVisualizationSettings,
  shouldFlipAxisName: boolean,
  renderingContext: RenderingContext,
): number => {
  const hasYAxisName = settings["graph.y_axis.labels_enabled"] !== false;

  if (!hasYAxisName) {
    return 0;
  }

  return (
    getYAxisTicksWidth(extent, formatter, settings, renderingContext) +
    CHART_STYLE.axisNameMargin +
    CHART_STYLE.axisName.size / 2
  );
};

const getXAxisNameGap = (
  chartModel: CartesianChartModel,
  settings: ComputedVisualizationSettings,
  formatter: AxisFormatter,
  renderingContext: RenderingContext,
): number => {
  return (
    getXAxisTicksHeight(chartModel, settings, formatter, renderingContext) +
    CHART_STYLE.axisNameMargin
  );
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

const getAxisRanges = (
  chartModel: CartesianChartModel,
  settings: ComputedVisualizationSettings,
): [AxisRange, AxisRange] => {
  const isNormalized = settings["stackable.stack_type"] === "normalized";
  const isAutoRangeEnabled = settings["graph.y_axis.auto_range"];

  if (isAutoRangeEnabled) {
    const defaultRange = isNormalized ? NORMALIZED_RANGE : {};
    return [defaultRange, defaultRange];
  }

  const customMin = settings["graph.y_axis.min"];
  const customMax = settings["graph.y_axis.max"];

  const [left, right] = chartModel.yAxisExtents;

  return [
    left != null ? getCustomAxisRange(left, customMin, customMax) : {},
    right != null ? getCustomAxisRange(right, customMin, customMax) : {},
  ];
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

const getXAxisType = (settings: ComputedVisualizationSettings) => {
  switch (settings["graph.x_axis.scale"]) {
    case "timeseries":
      return "time";
    case "linear":
      return "value";
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
  renderingContext: RenderingContext,
): CartesianAxisOption => {
  const { getColor } = renderingContext;
  const axisType = getXAxisType(settings);

  const boundaryGap =
    axisType === "value" ? undefined : ([0.02, 0.02] as [number, number]);
  // const boundaryGap = false;

  const nameGap = getXAxisNameGap(
    chartModel,
    settings,
    formatter,
    renderingContext,
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
    boundaryGap,
    splitLine: {
      show: false,
    },
    type: axisType,
    axisLabel: {
      show: !!settings["graph.x_axis.axis_enabled"],
      rotate: getRotateAngle(settings),
      ...getTicksDefaultOption(renderingContext),
      // Value is always converted to a string by ECharts
      formatter: (value: string) => {
        let valueToFormat: string | number = value;

        if (axisType === "time") {
          valueToFormat = moment(value).format("YYYY-MM-DDTHH:mm:ss");
        } else if (isNumeric(chartModel.dimensionModel.column)) {
          valueToFormat = parseInt(value, 10);
        }

        const formatted = formatter(valueToFormat);

        // Spaces force having padding between ticks
        return ` ${formatted} `;
      },
    },
    axisLine: {
      show: !!settings["graph.x_axis.axis_enabled"],
      lineStyle: {
        color: getColor("text-dark"),
      },
    },
  };
};

const buildMetricAxis = (
  settings: ComputedVisualizationSettings,
  position: "left" | "right",
  range: AxisRange,
  extent: Extent,
  formatter: AxisFormatter,
  axisName: string | undefined,
  renderingContext: RenderingContext,
): CartesianAxisOption => {
  const shouldFlipAxisName = position === "right";
  const nameGap = getYAxisNameGap(
    extent,
    formatter,
    settings,
    shouldFlipAxisName,
    renderingContext,
  );

  const valueGetter = getMetricDisplayValueGetter(settings);
  const axisType = settings["graph.y_axis.scale"] === "log" ? "log" : "value";

  return {
    type: axisType,
    ...range,
    ...getAxisNameDefaultOption(
      renderingContext,
      nameGap,
      axisName,
      shouldFlipAxisName ? -90 : undefined,
    ),
    splitLine: {
      lineStyle: {
        type: 5,
        color: renderingContext.getColor("border"),
      },
    },
    position,
    axisLabel: {
      show: !!settings["graph.y_axis.axis_enabled"],
      ...getTicksDefaultOption(renderingContext),
      // @ts-expect-error TODO: figure out EChart types
      formatter: value => formatter(valueGetter(value)),
    },
  };
};

export const getYAxisName = (
  chartModel: CartesianChartModel,
  settings: ComputedVisualizationSettings,
  position: "left" | "right",
) => {
  if (settings["graph.y_axis.labels_enabled"] === false) {
    return undefined;
  }

  const specifiedAxisName = settings["graph.y_axis.title_text"];

  if (specifiedAxisName != null) {
    return specifiedAxisName;
  }

  const axisSeriesKeys = chartModel.yAxisSplit[position === "left" ? 0 : 1];
  if (axisSeriesKeys.length > 1) {
    return undefined;
  }

  return position === "left"
    ? chartModel.leftAxisColumn?.display_name
    : chartModel.rightAxisColumn?.display_name;
};

const buildMetricsAxes = (
  chartModel: CartesianChartModel,
  settings: ComputedVisualizationSettings,
  axesFormatters: AxesFormatters,
  renderingContext: RenderingContext,
): CartesianAxisOption[] => {
  const [leftRange, rightRange] = getAxisRanges(chartModel, settings);
  const [leftExtent, rightExtent] = chartModel.yAxisExtents;
  const { left: leftFormatter, right: rightFormatter } = axesFormatters;

  const hasLeftAxis = leftFormatter != null && leftExtent != null;
  const hasRightAxis = rightFormatter != null && rightExtent != null;

  return [
    ...(hasLeftAxis
      ? [
          buildMetricAxis(
            settings,
            "left",
            leftRange,
            leftExtent,
            leftFormatter,
            getYAxisName(chartModel, settings, "left"),
            renderingContext,
          ),
        ]
      : []),
    ...(hasRightAxis
      ? [
          buildMetricAxis(
            settings,
            "right",
            rightRange,
            rightExtent,
            rightFormatter,
            getYAxisName(chartModel, settings, "right"),
            renderingContext,
          ),
        ]
      : []),
  ];
};

export const buildAxes = (
  chartModel: CartesianChartModel,
  settings: ComputedVisualizationSettings,
  axesFormatters: AxesFormatters,
  renderingContext: RenderingContext,
) => {
  return {
    xAxis: buildDimensionAxis(
      chartModel,
      settings,
      axesFormatters.bottom,
      renderingContext,
    ),
    yAxis: buildMetricsAxes(
      chartModel,
      settings,
      axesFormatters,
      renderingContext,
    ),
  };
};
