import type { RegisteredSeriesOption } from "echarts";
import type { SeriesLabelOption } from "echarts/types/src/util/types";

import type {
  SeriesModel,
  CartesianChartModel,
  DataKey,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { SeriesSettings } from "metabase-types/api";
import { isNotNull } from "metabase/lib/types";
import { getMetricDisplayValueGetter } from "metabase/visualizations/echarts/cartesian/model/dataset";

import { buildEChartsScatterSeries } from "../scatter/series";
import { getSeriesYAxisIndex } from "./utils";

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

  const valueGetter = getMetricDisplayValueGetter(settings);

  return {
    silent: true,
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
      const value = valueGetter((datum?.value as any)?.[dimensionName]);
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
  barSeriesCount: number,
  hasMultipleSeries: boolean,
  renderingContext: RenderingContext,
): RegisteredSeriesOption["bar"] => {
  const stackName =
    settings["stackable.stack_type"] != null ? `bar_${yAxisIndex}` : undefined;

  const isHistogram = settings["graph.x_axis.scale"] === "histogram";
  const barWidth = isHistogram ? `${100 / barSeriesCount - 1}%` : undefined;

  return {
    id: seriesModel.dataKey,
    emphasis: {
      focus: hasMultipleSeries ? "series" : "self",
      itemStyle: {
        color: seriesModel.color,
      },
    },
    blur: {
      label: {
        show: settings["graph.show_values"] && !hasMultipleSeries,
      },
      itemStyle: {
        opacity: 0.3,
      },
    },
    type: "bar",
    yAxisIndex,
    barGap: 0,
    barWidth,
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
  hasMultipleSeries: boolean,
  renderingContext: RenderingContext,
): RegisteredSeriesOption["line"] => {
  const display = seriesSettings?.display ?? "line";

  const stackName =
    settings["stackable.stack_type"] != null ? `area_${yAxisIndex}` : undefined;

  return {
    emphasis: {
      focus: hasMultipleSeries ? "series" : "self",
      itemStyle: {
        color: seriesModel.color,
      },
    },
    blur: {
      label: {
        show: settings["graph.show_values"] && !hasMultipleSeries,
      },
      itemStyle: {
        opacity: 0.3,
      },
    },
    id: seriesModel.dataKey,
    type: "line",
    yAxisIndex,
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
): (
  | RegisteredSeriesOption["line"]
  | RegisteredSeriesOption["bar"]
  | RegisteredSeriesOption["scatter"]
)[] => {
  const seriesSettingsByDataKey = chartModel.seriesModels.reduce(
    (acc, seriesModel) => {
      acc[seriesModel.dataKey] = settings.series(
        seriesModel.legacySeriesSettingsObjectKey,
      );
      return acc;
    },
    {} as Record<DataKey, SeriesSettings>,
  );

  const barSeriesCount = Object.values(seriesSettingsByDataKey).filter(
    seriesSettings => seriesSettings.display === "bar",
  ).length;

  const hasMultipleSeries = chartModel.seriesModels.length > 1;

  return chartModel.seriesModels
    .map(seriesModel => {
      const seriesSettings = seriesSettingsByDataKey[seriesModel.dataKey];
      const yAxisIndex = getSeriesYAxisIndex(seriesModel, chartModel);

      switch (seriesSettings.display) {
        case "line":
        case "area":
          return buildEChartsLineAreaSeries(
            seriesModel,
            seriesSettings,
            settings,
            chartModel.dimensionModel.dataKey,
            yAxisIndex,
            hasMultipleSeries,
            renderingContext,
          );
        case "bar":
          return buildEChartsBarSeries(
            seriesModel,
            seriesSettings,
            settings,
            chartModel.dimensionModel.dataKey,
            yAxisIndex,
            barSeriesCount,
            hasMultipleSeries,
            renderingContext,
          );
        case "scatter":
          return buildEChartsScatterSeries(
            seriesModel,
            chartModel.dataset,
            chartModel.dimensionModel.dataKey,
            chartModel.bubbleSizeDataKey,
            yAxisIndex,
            renderingContext,
          );
      }
    })
    .filter(isNotNull);
};
