import moment from "moment-timezone";
import type { AxisBaseOptionCommon } from "echarts/types/src/coord/axisCommonTypes";
import type { CartesianAxisOption } from "echarts/types/src/coord/cartesian/AxisModel";
import type {
  ComputedVisualizationSettings,
  RemappingHydratedDatasetColumn,
  RenderingContext,
} from "metabase/visualizations/types";
import type { CardSeriesModel } from "metabase/visualizations/echarts/cartesian/model/types";
import { isNumeric } from "metabase-lib/types/utils/isa";

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

const buildMetricsAxes = (
  settings: ComputedVisualizationSettings,
  column: RemappingHydratedDatasetColumn,
  renderingContext: RenderingContext,
): CartesianAxisOption[] => {
  const { getColor } = renderingContext;
  const formatter = (value: unknown) => {
    return renderingContext.formatValue(value, {
      column,
      ...(settings.column?.(column) ?? {}),
    });
  };

  // TODO: support Y-axis split
  return [
    {
      ...getAxisNameDefaultOption(
        renderingContext,
        40, // TODO: compute
        settings["graph.y_axis.title_text"],
      ),
      splitLine: {
        lineStyle: {
          type: 5,
          color: getColor("border"),
        },
      },
      axisLabel: {
        ...getTicksDefaultOption(renderingContext),
        // @ts-expect-error TODO: figure out EChart types
        formatter: (value: string) => {
          return formatter(value);
        },
      },
    },
  ];
};

export const buildAxes = (
  cardSeriesModel: CardSeriesModel,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
) => {
  return {
    xAxis: buildDimensionAxis(
      settings,
      cardSeriesModel.dimension.column,
      renderingContext,
    ),
    yAxis: buildMetricsAxes(
      settings,
      cardSeriesModel.metrics[0].column,
      renderingContext,
    ),
  };
};
