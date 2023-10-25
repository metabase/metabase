import type { EChartsOption, RegisteredSeriesOption } from "echarts";
import type { SeriesLabelOption } from "echarts/types/src/util/types";
import type {
  CardSeriesModel,
  SeriesModel,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type {
  ComputedVisualizationSettings,
  Formatter,
  RenderingContext,
} from "metabase/visualizations/types";
import type { SeriesSettings } from "metabase-types/api";
import { isNotNull } from "metabase/core/utils/types";

export const getSeriesVizSettingsKey = (
  seriesModel: SeriesModel,
  formatValue: Formatter,
) => {
  const { datasetIndex, cardName, column } = seriesModel;

  const isMainDataset = datasetIndex === 0;
  const prefix = isMainDataset || cardName == null ? "" : `${cardName}: `;

  const key =
    "breakoutValue" in seriesModel
      ? formatValue(seriesModel.breakoutValue, {
          column: seriesModel.breakoutColumn,
        })
      : column.name;

  return prefix + key;
};

// HACK: creates a pseudo legacy series object to integrate with the `series` function in computed settings.
// This workaround is necessary for generating a compatible key with `keyForSingleSeries` function,
// ensuring the correct retrieval of series visualization settings based on the provided `seriesVizSettingsKey`.
// Will be replaced with just a string key when implementing the dynamic line/area/bar.
const createLegacySeriesObjectKey = (seriesVizSettingsKey: string) => ({
  card: {
    _seriesKey: seriesVizSettingsKey,
  },
});

const buildEChartsLabelOptions = (
  seriesModel: SeriesModel,
  settings: ComputedVisualizationSettings,
  seriesSettings: SeriesSettings,
  { getColor, fontFamily, formatValue }: RenderingContext,
): SeriesLabelOption => {
  const valueFormatter = (value: unknown) =>
    formatValue(value, {
      ...(settings.column?.(seriesModel.column) ?? {}),
      column: seriesModel.column,
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
      if (dimensionIndex == null || dimensionName == null) {
        return " ";
      }
      const value = datum?.value?.[dimensionName];
      return valueFormatter(value);
    },
  };
};

const buildEChartsBarSeries = (
  seriesModel: SeriesModel,
  seriesSettings: SeriesSettings,
  seriesColor: string,
  settings: ComputedVisualizationSettings,
  dimensionDataKey: string,
  renderingContext: RenderingContext,
): RegisteredSeriesOption["bar"] => {
  const stackName =
    settings["stackable.stack_type"] != null ? "bar" : undefined;

  return {
    type: "bar",
    datasetIndex: seriesModel.datasetIndex,
    stack: stackName,
    encode: {
      y: seriesModel.dataKey,
      x: dimensionDataKey,
    },
    label: buildEChartsLabelOptions(
      seriesModel,
      settings,
      seriesSettings,
      renderingContext,
    ),
    labelLayout: {
      hideOverlap: settings["graph.label_value_frequency"] === "fit",
    },
    itemStyle: {
      color: seriesColor,
    },
  };
};

const buildEChartsLineAreaSeries = (
  seriesModel: SeriesModel,
  seriesSettings: SeriesSettings,
  seriesColor: string,
  settings: ComputedVisualizationSettings,
  dimensionDataKey: string,
  renderingContext: RenderingContext,
): RegisteredSeriesOption["line"] => {
  const display = seriesSettings?.display ?? "line";

  const stackName =
    settings["stackable.stack_type"] != null ? "area" : undefined;

  return {
    type: "line",
    datasetIndex: seriesModel.datasetIndex,
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
    label: buildEChartsLabelOptions(
      seriesModel,
      settings,
      seriesSettings,
      renderingContext,
    ),
    labelLayout: {
      hideOverlap: settings["graph.label_value_frequency"] === "fit",
    },
    itemStyle: {
      color: seriesColor,
    },
  };
};

export const buildEChartsSeries = (
  cardSeriesModels: CardSeriesModel[],
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): EChartsOption["series"] => {
  return cardSeriesModels.flatMap(cardSeriesModel =>
    cardSeriesModel.metrics
      .map(seriesModel => {
        const seriesVizSettingsKey = getSeriesVizSettingsKey(
          seriesModel,
          renderingContext.formatValue,
        );

        const seriesSettings: SeriesSettings = settings.series(
          createLegacySeriesObjectKey(seriesVizSettingsKey),
        );
        const seriesColor =
          settings?.["series_settings.colors"]?.[seriesVizSettingsKey];

        switch (seriesSettings.display) {
          case "line":
          case "area":
            return buildEChartsLineAreaSeries(
              seriesModel,
              seriesSettings,
              seriesColor,
              settings,
              cardSeriesModel.dimension.dataKey,
              renderingContext,
            );
          case "bar":
            return buildEChartsBarSeries(
              seriesModel,
              seriesSettings,
              seriesColor,
              settings,
              cardSeriesModel.dimension.dataKey,
              renderingContext,
            );
        }

        return null;
      })
      .filter(isNotNull),
  );
};
