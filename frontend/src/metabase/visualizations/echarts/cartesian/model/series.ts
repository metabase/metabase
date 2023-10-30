import type {
  SingleSeries,
  DatasetData,
  RowValue,
  DatasetColumn,
  RawSeries,
} from "metabase-types/api";
import type { CartesianChartColumns } from "metabase/visualizations/lib/graph/columns";
import type {
  SeriesModel,
  VizSettingsKey,
} from "metabase/visualizations/echarts/cartesian/model/types";
import { getDatasetKey } from "metabase/visualizations/echarts/cartesian/model/dataset";
import type {
  ComputedVisualizationSettings,
  Formatter,
  RenderingContext,
} from "metabase/visualizations/types";
import { isNotNull } from "metabase/core/utils/types";

type SeriesVizSettingsKeyParams = {
  cardName?: string;
  isFirstCard: boolean;
} & (
  | {
      metricColumn: DatasetColumn;
    }
  | {
      breakoutColumn: DatasetColumn;
      breakoutValue: RowValue;
      formatValue: Formatter;
    }
);

export const getSeriesVizSettingsKey = ({
  cardName,
  isFirstCard,
  ...params
}: SeriesVizSettingsKeyParams): VizSettingsKey => {
  // When multiple cards are combined on a dashboard, all cards
  // except the first include the card name in the viz settings key.
  const prefix = isFirstCard && cardName == null ? `${cardName}: ` : "";

  const isBreakoutSeries = "breakoutValue" in params;

  // Unfortunately, breakout series include formatted breakout values in the key
  // which can be different based on a user's locale.
  const key = isBreakoutSeries
    ? params.formatValue(params.breakoutValue, {
        column: params.breakoutColumn,
      })
    : params.metricColumn.name;

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

export const getBreakoutDistinctValues = (
  data: DatasetData,
  breakoutIndex: number,
) => Array.from(new Set<RowValue>(data.rows.map(row => row[breakoutIndex])));

export const getCardSeriesModels = (
  { card, data }: SingleSeries,
  columns: CartesianChartColumns,
  isFirstCard: boolean,
  renderingContext: RenderingContext,
): SeriesModel[] => {
  const hasBreakout = "breakout" in columns;

  if (!hasBreakout) {
    return columns.metrics.map(metric => {
      const vizSettingsKey = getSeriesVizSettingsKey({
        cardName: card.name,
        metricColumn: metric.column,
        isFirstCard,
      });

      return {
        cardId: card.id,
        column: metric.column,
        columnIndex: metric.index,
        dataKey: getDatasetKey({ column: metric.column, cardId: card.id }),
        vizSettingsKey,
        legacySeriesSettingsObjectKey:
          createLegacySeriesObjectKey(vizSettingsKey),
      };
    });
  }

  const { metric, breakout } = columns;
  const breakoutValues = getBreakoutDistinctValues(data, breakout.index);

  return breakoutValues.map(breakoutValue => {
    const vizSettingsKey = getSeriesVizSettingsKey({
      cardName: card.name,
      isFirstCard,
      breakoutValue,
      breakoutColumn: breakout.column,
      formatValue: renderingContext.formatValue,
    });

    return {
      cardId: card.id,
      column: metric.column,
      columnIndex: metric.index,
      vizSettingsKey,
      legacySeriesSettingsObjectKey:
        createLegacySeriesObjectKey(vizSettingsKey),
      dataKey: getDatasetKey({
        column: metric.column,
        breakoutValue,
        cardId: card.id,
      }),
      breakoutColumnIndex: breakout.index,
      breakoutColumn: breakout.column,
      breakoutValue,
    };
  });
};

export const getDimensionModel = (
  rawSeries: RawSeries,
  cardColumns: CartesianChartColumns[],
) => {
  return {
    dataKey: getDatasetKey({
      cardId: rawSeries[0].card.id,
      column: cardColumns[0].dimension.column,
    }),
    column: cardColumns[0].dimension.column,
    columnIndex: cardColumns[0].dimension.index,
  };
};

export const applySortingVisibilitySettings = (
  seriesModels: SeriesModel[],
  settings: ComputedVisualizationSettings,
) => {
  return (settings["graph.series_order"] ?? [])
    .map(({ key, enabled }) => {
      if (!enabled) {
        return null;
      }

      return seriesModels.find(seriesModel => seriesModel.dataKey === key);
    })
    .filter(isNotNull);
};
