import type { EChartsOption, RegisteredSeriesOption } from "echarts";
import type {
  CardSeriesModel,
  SeriesModel,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type {
  ComputedVisualizationSettings,
  Formatter,
  RenderingContext,
} from "metabase/visualizations/types";

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

const buildOptionSeries = (
  seriesModel: SeriesModel,
  seriesVizSettingsKey: string,
  settings: ComputedVisualizationSettings,
  dimensionDataKey: string,
  { getColor, fontFamily }: RenderingContext,
): RegisteredSeriesOption["line"] | RegisteredSeriesOption["bar"] => {
  const seriesSettings = settings.series_settings?.[seriesVizSettingsKey];
  const display = seriesSettings?.display ?? "line";

  const stack =
    settings["stackable.stack_type"] != null &&
    ["bar", "area"].includes(display)
      ? display
      : undefined;

  return {
    datasetIndex: seriesModel.datasetIndex,
    symbolSize: 6,
    stack,
    type: display === "bar" ? "bar" : "line",
    areaStyle: display === "area" ? { opacity: 0.3 } : undefined,
    encode: {
      y: seriesModel.dataKey,
      x: dimensionDataKey,
    },
    label: {
      show: settings["graph.show_values"],
      position: "top",
      fontFamily,
      fontWeight: 900,
      fontSize: 12,
      color: getColor("text-dark"),
      textBorderColor: getColor("white"),
      textBorderWidth: 3,
    },
    labelLayout: {
      hideOverlap: settings["graph.label_value_frequency"] === "fit",
    },
    itemStyle: {
      color: settings?.["series_settings.colors"]?.[seriesVizSettingsKey],
    },
  };
};

export const buildOptionMultipleSeries = (
  cardSeriesModels: CardSeriesModel[],
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): EChartsOption["series"] => {
  return cardSeriesModels.flatMap(cardSeriesModel =>
    cardSeriesModel.metrics.map(seriesModel => {
      const seriesSettingsKey = getSeriesVizSettingsKey(
        seriesModel,
        renderingContext.formatValue,
      );

      return buildOptionSeries(
        seriesModel,
        seriesSettingsKey,
        settings,
        cardSeriesModel.dimension.dataKey,
        renderingContext,
      );
    }),
  );
};
