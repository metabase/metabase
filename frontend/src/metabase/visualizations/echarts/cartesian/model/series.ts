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
  Formatter,
  RenderingContext,
} from "metabase/visualizations/types";

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
    return columns.metrics.map(metric => ({
      cardId: card.id,
      column: metric.column,
      columnIndex: metric.index,
      dataKey: getDatasetKey({ column: metric.column, cardId: card.id }),
      vizSettingsKey: getSeriesVizSettingsKey({
        cardName: card.name,
        metricColumn: metric.column,
        isFirstCard,
      }),
    }));
  }

  const { metric, breakout } = columns;
  const breakoutValues = getBreakoutDistinctValues(data, breakout.index);

  return breakoutValues.map(breakoutValue => {
    return {
      cardId: card.id,
      column: metric.column,
      columnIndex: metric.index,
      vizSettingsKey: getSeriesVizSettingsKey({
        cardName: card.name,
        isFirstCard,
        breakoutValue,
        breakoutColumn: breakout.column,
        formatValue: renderingContext.formatValue,
      }),
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
