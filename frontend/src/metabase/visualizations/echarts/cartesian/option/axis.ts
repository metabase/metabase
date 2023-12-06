// eslint-disable-next-line no-restricted-imports
import moment from "moment-timezone";
import type { AxisBaseOptionCommon } from "echarts/types/src/coord/axisCommonTypes";
import type { CartesianAxisOption } from "echarts/types/src/coord/cartesian/AxisModel";
import type {
  ComputedVisualizationSettings,
  RemappingHydratedDatasetColumn,
  RenderingContext,
} from "metabase/visualizations/types";
import type {
  CartesianChartModel,
  Extent,
} from "metabase/visualizations/echarts/cartesian/model/types";

import { isNumeric } from "metabase-lib/types/utils/isa";

type AxisRange = {
  min?: number;
  max?: number;
};

const NORMALIZED_RANGE = { min: 0, max: 1 };

const getCustomAxisRange = (
  extents: Extent[],
  min: number | undefined,
  max: number | undefined,
) => {
  if (extents.length === 0) {
    return { min: undefined, max: undefined };
  }

  const [combinedMin, combinedMax] = extents.reduce(
    (combinedExtent, extent) => {
      if (!combinedExtent) {
        return extent;
      }

      return [
        Math.min(combinedExtent[0], extent[0]),
        Math.max(combinedExtent[1], extent[1]),
      ];
    },
  );

  // if min/max are not specified or within series extents return `undefined`
  // so that ECharts compute a rounded range automatically
  const finalMin = min != null && min < combinedMin ? min : undefined;
  const finalMax = max != null && max > combinedMax ? max : undefined;

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

  const [left, right] = chartModel.yAxisSplit;

  return [
    getCustomAxisRange(
      left.map(dataKey => chartModel.extents[dataKey]),
      customMin,
      customMax,
    ),
    getCustomAxisRange(
      right.map(dataKey => chartModel.extents[dataKey]),
      customMin,
      customMax,
    ),
  ];
};

const getAxisNameDefaultOption = (
  { getColor, fontFamily }: RenderingContext,
  nameGap: number,
  name?: string,
): Partial<AxisBaseOptionCommon> => ({
  name,
  nameGap,
  nameLocation: "middle",
  nameTextStyle: {
    color: getColor("text-dark"),
    fontSize: 14,
    fontWeight: 900,
    fontFamily,
  },
});

const getTicksDefaultOption = ({ getColor, fontFamily }: RenderingContext) => {
  return {
    hideOverlap: true,
    color: getColor("text-dark"),
    fontSize: 12,
    fontWeight: 900,
    fontFamily,
  };
};

export const getXAxisType = (settings: ComputedVisualizationSettings) => {
  switch (settings["graph.x_axis.scale"]) {
    case "timeseries":
      return "time";
    case "linear":
      return "value";
    default:
      // TODO: implement histogram
      return "category";
  }
};

export const buildDimensionAxis = (
  settings: ComputedVisualizationSettings,
  column: RemappingHydratedDatasetColumn,
  renderingContext: RenderingContext,
): CartesianAxisOption => {
  const { getColor } = renderingContext;
  const axisType = getXAxisType(settings);

  const formatter = (value: unknown) => {
    return renderingContext.formatValue(value, {
      column,
      ...(settings.column?.(column) ?? {}),
      jsx: false,
    });
  };

  const boundaryGap =
    axisType === "value" ? undefined : ([0.02, 0.02] as [number, number]);

  return {
    ...getAxisNameDefaultOption(
      renderingContext,
      24, // TODO: compute
      settings["graph.x_axis.title_text"],
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
      ...getTicksDefaultOption(renderingContext),
      // Value is always converted to a string by ECharts
      formatter: (value: string) => {
        let valueToFormat: string | number = value;

        if (axisType === "time") {
          valueToFormat = moment(value).format("YYYY-MM-DDTHH:mm:ss");
        } else if (isNumeric(column)) {
          valueToFormat = parseInt(value, 10);
        }

        const formatted = formatter(valueToFormat);

        // Spaces force having padding between ticks
        return ` ${formatted} `;
      },
    },
    axisLine: {
      lineStyle: {
        color: getColor("text-dark"),
      },
    },
  };
};

const buildMetricAxis = (
  settings: ComputedVisualizationSettings,
  column: RemappingHydratedDatasetColumn,
  position: "left" | "right",
  range: AxisRange,
  renderingContext: RenderingContext,
  name?: string,
): CartesianAxisOption => {
  const formatter = (value: unknown) => {
    return renderingContext.formatValue(value, {
      column,
      ...(settings.column?.(column) ?? {}),
    });
  };

  const isNormalized = settings["stackable.stack_type"] === "normalized";

  const percentageFormatter = (value: unknown) =>
    renderingContext.formatValue(value, {
      column: column,
      number_style: "percent",
    });

  return {
    ...range,
    ...getAxisNameDefaultOption(
      renderingContext,
      40, // TODO: compute
      name,
    ),
    splitLine: {
      lineStyle: {
        type: 5,
        color: renderingContext.getColor("border"),
      },
    },
    position,
    axisLabel: {
      ...getTicksDefaultOption(renderingContext),
      // @ts-expect-error TODO: figure out EChart types
      formatter: (value: string) => {
        const formatterFn = isNormalized ? percentageFormatter : formatter;
        return formatterFn(value);
      },
    },
  };
};

const buildMetricsAxes = (
  chartModel: CartesianChartModel,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): CartesianAxisOption[] => {
  const [leftRange, rightRange] = getAxisRanges(chartModel, settings);
  const { leftAxisColumn, rightAxisColumn } = chartModel;

  return [
    ...(leftAxisColumn != null
      ? [
          buildMetricAxis(
            settings,
            leftAxisColumn,
            "left",
            leftRange,
            renderingContext,
            settings["graph.y_axis.title_text"],
          ),
        ]
      : []),
    ...(rightAxisColumn != null
      ? [
          buildMetricAxis(
            settings,
            rightAxisColumn,
            "right",
            rightRange,
            renderingContext,
          ),
        ]
      : []),
  ];
};

export const buildAxes = (
  chartModel: CartesianChartModel,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
) => {
  return {
    xAxis: buildDimensionAxis(
      settings,
      chartModel.dimensionModel.column,
      renderingContext,
    ),
    yAxis: buildMetricsAxes(chartModel, settings, renderingContext),
  };
};
