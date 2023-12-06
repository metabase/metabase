import type {
  SingleSeries,
  DatasetData,
  RowValue,
  DatasetColumn,
  RawSeries,
} from "metabase-types/api";
import type { CartesianChartColumns } from "metabase/visualizations/lib/graph/columns";
import type {
  LegacySeriesSettingsObjectKey,
  SeriesModel,
  VizSettingsKey,
} from "metabase/visualizations/echarts/cartesian/model/types";
import { getDatasetKey } from "metabase/visualizations/echarts/cartesian/model/dataset";
import type {
  Formatter,
  RenderingContext,
} from "metabase/visualizations/types";

type MetricSeriesParams = {
  metricColumn: DatasetColumn;
};

type BreakoutSeriesParams = {
  breakoutColumn: DatasetColumn;
  breakoutValue: RowValue;
  formatValue: Formatter;
};

type SeriesVizSettingsKeyParams = {
  cardName?: string;
  isFirstCard: boolean;
} & (MetricSeriesParams | BreakoutSeriesParams);

const getSeriesVizSettingsKey = ({
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
const createLegacySeriesObjectKey = (
  seriesVizSettingsKey: string,
): LegacySeriesSettingsObjectKey => ({
  card: {
    _seriesKey: seriesVizSettingsKey,
  },
});

const getBreakoutDistinctValues = (data: DatasetData, breakoutIndex: number) =>
  Array.from(new Set<RowValue>(data.rows.map(row => row[breakoutIndex])));

/**
 * Generates series models for a given card with a dataset.
 *
 * @param {SingleSeries} singleSeries - The single card and dataset.
 * @param {CartesianChartColumns} columns - The columns model for the card.
 * @param {boolean} isFirstCard - Indicates whether the card is the first card in the
 *                                case of combined cards on a dashboard.
 * @param {RenderingContext} renderingContext - The rendering context.
 * @returns {SeriesModel[]} The generated series models for the card.
 */
export const getCardSeriesModels = (
  { card, data }: SingleSeries,
  columns: CartesianChartColumns,
  isFirstCard: boolean,
  renderingContext: RenderingContext,
): SeriesModel[] => {
  const hasBreakout = "breakout" in columns;

  // Charts without breakout have one series per selected metric column.
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
        dataKey: getDatasetKey(metric.column, card.id),
        vizSettingsKey,
        legacySeriesSettingsObjectKey:
          createLegacySeriesObjectKey(vizSettingsKey),
      };
    });
  }

  // Charts with breakout have one series per a unique breakout value. They can have only one metric in such cases.
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
      dataKey: getDatasetKey(metric.column, card.id, breakoutValue),
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
    dataKey: getDatasetKey(
      cardColumns[0].dimension.column,
      rawSeries[0].card.id,
    ),
    column: cardColumns[0].dimension.column,
    columnIndex: cardColumns[0].dimension.index,
  };
};
