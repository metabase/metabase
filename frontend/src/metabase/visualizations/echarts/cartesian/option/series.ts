import type { EChartsOption, RegisteredSeriesOption } from "echarts";
import type { SeriesLabelOption } from "echarts/types/src/util/types";
import type {
  SeriesModel,
  CartesianChartModel,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { SeriesSettings } from "metabase-types/api";
import { isNotNull } from "metabase/lib/types";

const buildEChartsLabelOptions = (
  seriesModel: SeriesModel,
  settings: ComputedVisualizationSettings,
  { getColor, fontFamily, formatValue }: RenderingContext,
): SeriesLabelOption => {
  const valueFormatter = (value: unknown) =>
    formatValue(value, {
      ...(settings.column?.(seriesModel.column) ?? {}),
      jsx: false,
      compact: settings["graph.label_value_formatting"] === "compact",
    });

  return {
    show: settings["graph.show_values"],
    position: "top",
    fontFamily,
    fontWeight: 900,
    fontSize: 12,
    color: getColor("text-dark"),
    textBorderColor: getColor("white"),
    textBorderWidth: 3,
    formatter: datum => {
      const dimensionIndex = datum?.encode?.y[0];
      const dimensionName =
        dimensionIndex != null ? datum?.dimensionNames?.[dimensionIndex] : null;
      if (dimensionName == null) {
        return " ";
      }
      const value = (datum?.value as any)?.[dimensionName];
      return valueFormatter(value);
    },
  };
};

const buildEChartsBarSeries = (
  seriesModel: SeriesModel,
  seriesSettings: SeriesSettings,
  settings: ComputedVisualizationSettings,
  dimensionDataKey: string,
  yAxisIndex: number,
  renderingContext: RenderingContext,
): RegisteredSeriesOption["bar"] => {
  const stackName =
    settings["stackable.stack_type"] != null ? `bar_${yAxisIndex}` : undefined;
  const datasetIndex =
    settings["stackable.stack_type"] === "normalized" ? 1 : 0;

  return {
    type: "bar",
    yAxisIndex,
    datasetIndex,
    stack: stackName,
    encode: {
      y: seriesModel.dataKey,
      x: dimensionDataKey,
    },
    label: buildEChartsLabelOptions(seriesModel, settings, renderingContext),
    labelLayout: {
      hideOverlap: settings["graph.label_value_frequency"] === "fit",
    },
    itemStyle: {
      color: seriesModel.color,
    },
  };
};

const buildEChartsLineAreaSeries = (
  seriesModel: SeriesModel,
  seriesSettings: SeriesSettings,
  settings: ComputedVisualizationSettings,
  dimensionDataKey: string,
  yAxisIndex: number,
  renderingContext: RenderingContext,
): RegisteredSeriesOption["line"] => {
  const display = seriesSettings?.display ?? "line";

  const stackName =
    settings["stackable.stack_type"] != null ? `area_${yAxisIndex}` : undefined;
  const datasetIndex =
    settings["stackable.stack_type"] === "normalized" ? 1 : 0;

  return {
    type: "line",
    yAxisIndex,
    datasetIndex,
    showSymbol: seriesSettings["line.marker_enabled"] !== false,
    symbolSize: 6,
    smooth: seriesSettings["line.interpolate"] === "cardinal",
    connectNulls: seriesSettings["line.missing"] === "interpolate",
    step:
      seriesSettings["line.interpolate"] === "step-after" ? "end" : undefined,
    stack: stackName,
    areaStyle: display === "area" ? { opacity: 0.3 } : undefined,
    encode: {
      y: seriesModel.dataKey,
      x: dimensionDataKey,
    },
    label: buildEChartsLabelOptions(seriesModel, settings, renderingContext),
    labelLayout: {
      hideOverlap: settings["graph.label_value_frequency"] === "fit",
    },
    itemStyle: {
      color: seriesModel.color,
    },
  };
};

export const buildEChartsSeries = (
  chartModel: CartesianChartModel,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): EChartsOption["series"] => {
  return chartModel.seriesModels
    .map(seriesModel => {
      const seriesSettings: SeriesSettings = settings.series(
        seriesModel.legacySeriesSettingsObjectKey,
      );

      const yAxisIndex = chartModel.yAxisSplit[0].includes(seriesModel.dataKey)
        ? 0
        : 1;

      switch (seriesSettings.display) {
        case "line":
        case "area":
          return buildEChartsLineAreaSeries(
            seriesModel,
            seriesSettings,
            settings,
            chartModel.dimensionModel.dataKey,
            yAxisIndex,
            renderingContext,
          );
        case "bar":
          return buildEChartsBarSeries(
            seriesModel,
            seriesSettings,
            settings,
            chartModel.dimensionModel.dataKey,
            yAxisIndex,
            renderingContext,
          );
      }
    })
    .filter(isNotNull);
};
