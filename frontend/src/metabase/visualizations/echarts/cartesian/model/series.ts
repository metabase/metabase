import type { SingleSeries, DatasetData, RowValue } from "metabase-types/api";
import type { ChartColumns } from "metabase/visualizations/lib/graph/columns";
import type {
  CardSeriesModel,
  SeriesModel,
} from "metabase/visualizations/echarts/cartesian/model/types";
import { getDatasetSeriesKey } from "metabase/visualizations/echarts/cartesian/model/dataset";

export const getBreakoutDistinctValues = (
  data: DatasetData,
  breakoutIndex: number,
) => Array.from(new Set<RowValue>(data.rows.map(row => row[breakoutIndex])));

export const getCardSeriesModels = (
  { card, data }: SingleSeries,
  columns: ChartColumns,
  datasetIndex: number,
): CardSeriesModel => {
  let metrics: SeriesModel[];
  if ("breakout" in columns) {
    const { metric, breakout } = columns;
    const breakoutValues = getBreakoutDistinctValues(data, breakout.index);

    metrics = breakoutValues.map(breakoutValue => {
      return {
        datasetIndex,
        cardId: card.id,
        cardName: card.name,
        column: metric.column,
        columnIndex: metric.index,
        dataKey: getDatasetSeriesKey(metric.column, breakoutValue),
        breakoutColumnIndex: breakout.index,
        breakoutColumn: breakout.column,
        breakoutValue,
      };
    });
  } else {
    metrics = columns.metrics.map(metric => ({
      datasetIndex,
      cardId: card.id,
      cardName: card.name,
      column: metric.column,
      columnIndex: metric.index,
      dataKey: getDatasetSeriesKey(metric.column),
    }));
  }

  const dimension: SeriesModel = {
    datasetIndex,
    cardId: card.id,
    column: columns.dimension.column,
    columnIndex: columns.dimension.index,
    dataKey: getDatasetSeriesKey(columns.dimension.column),
  };

  return {
    dimension,
    metrics,
  };
};
