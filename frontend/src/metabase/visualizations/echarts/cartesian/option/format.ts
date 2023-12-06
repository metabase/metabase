import type {
  AxesFormatters,
  AxisFormatter,
} from "metabase/visualizations/echarts/cartesian/option/types";
import type { CartesianChartModel } from "metabase/visualizations/echarts/cartesian/model/types";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { DatasetColumn } from "metabase-types/api";

const getYAxisFormatter = (
  column: DatasetColumn,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): AxisFormatter => {
  const isNormalized = settings["stackable.stack_type"] === "normalized";

  if (isNormalized) {
    return (value: unknown) =>
      renderingContext.formatValue(value, {
        column,
        number_style: "percent",
        jsx: false,
      });
  }

  return (value: unknown) => {
    return renderingContext.formatValue(value, {
      column,
      ...(settings.column?.(column) ?? {}),
      jsx: false,
    });
  };
};

const getXAxisFormatter = (
  column: DatasetColumn,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
) => {
  const isHistogram = settings["graph.x_axis.scale"] === "histogram";

  return (value: unknown) =>
    renderingContext.formatValue(value, {
      column,
      ...(settings.column?.(column) ?? {}),
      jsx: false,
      noRange: isHistogram,
    });
};

export const getAxesFormatters = (
  chartModel: CartesianChartModel,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): AxesFormatters => {
  const formatters: AxesFormatters = {
    bottom: getXAxisFormatter(
      chartModel.dimensionModel.column,
      settings,
      renderingContext,
    ),
  };

  if (chartModel.leftAxisColumn) {
    formatters.left = getYAxisFormatter(
      chartModel.leftAxisColumn,
      settings,
      renderingContext,
    );
  }

  if (chartModel.rightAxisColumn) {
    formatters.right = getYAxisFormatter(
      chartModel.rightAxisColumn,
      settings,
      renderingContext,
    );
  }

  return formatters;
};
