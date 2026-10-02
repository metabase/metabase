import {
  type DatasetColumn,
  type DatasetData,
  type RowValue,
  getRowsForStableKeys,
} from "metabase-types/api";

import type {
  CartesianChartColumns,
  ColumnDescriptor,
} from "../../lib/graph/columns";
import type { ComputedVisualizationSettings } from "../../types";

export type ColumnFormatter = (
  value: RowValue,
  column: DatasetColumn,
) => string;

export type SeriesInfo = {
  metricColumn: DatasetColumn;
  dimensionColumn: DatasetColumn;
  breakoutValue?: RowValue;
};

type SeriesDefinition = {
  seriesKey: string;
  seriesName: string;
  seriesInfo: SeriesInfo;
};

const getBreakoutDistinctValues = (
  data: DatasetData,
  breakout: ColumnDescriptor,
  columnFormatter: ColumnFormatter,
): Map<string, string> => {
  const result = new Map<string, string>();
  const usedRawValues = new Set<RowValue>();

  const rowsForKeys = getRowsForStableKeys(data);
  for (let index = 0; index < rowsForKeys.length; index++) {
    const rawValue = rowsForKeys[index][breakout.index];

    if (usedRawValues.has(rawValue)) {
      continue;
    }

    usedRawValues.add(rawValue);
    const formattedKey = columnFormatter(rawValue, breakout.column);
    const displayValue = data.untranslatedRows
      ? columnFormatter(data.rows[index][breakout.index], breakout.column)
      : formattedKey;
    result.set(formattedKey, displayValue);
  }

  return result;
};

const getBreakoutSeries = (
  breakoutValues: Map<string, string>,
  metric: ColumnDescriptor,
  dimension: ColumnDescriptor,
  settings: ComputedVisualizationSettings,
): SeriesDefinition[] => {
  return Array.from(breakoutValues.entries()).map(
    ([breakoutKey, displayValue]) => {
      const customName = settings?.series_settings?.[breakoutKey]?.title;
      return {
        seriesKey: breakoutKey,
        seriesName: customName ?? displayValue,
        seriesInfo: {
          metricColumn: metric.column,
          dimensionColumn: dimension.column,
          breakoutValue: breakoutKey,
        },
      };
    },
  );
};

const getMultipleMetricSeries = (
  dimension: ColumnDescriptor,
  metrics: ColumnDescriptor[],
  settings: ComputedVisualizationSettings,
): SeriesDefinition[] => {
  return metrics.map((metric) => {
    const seriesKey = metric.column.name;
    const customName = settings?.series_settings?.[seriesKey]?.title;
    const defaultName = metric.column.display_name ?? metric.column.name;
    return {
      seriesKey,
      seriesName: customName ?? defaultName,
      seriesInfo: {
        dimensionColumn: dimension.column,
        metricColumn: metric.column,
      },
    };
  });
};

export const getSeries = (
  data: DatasetData,
  chartColumns: CartesianChartColumns,
  columnFormatter: ColumnFormatter,
  settings: ComputedVisualizationSettings,
): SeriesDefinition[] => {
  if ("breakout" in chartColumns) {
    const breakoutValues = getBreakoutDistinctValues(
      data,
      chartColumns.breakout,
      columnFormatter,
    );

    return getBreakoutSeries(
      breakoutValues,
      chartColumns.metric,
      chartColumns.dimension,
      settings,
    );
  }

  return getMultipleMetricSeries(
    chartColumns.dimension,
    chartColumns.metrics,
    settings,
  );
};

export const sanitizeResultData = (data: DatasetData) => {
  return {
    ...data,
    cols: data.cols.filter((col) => col.name !== "pivot-grouping"),
  };
};
