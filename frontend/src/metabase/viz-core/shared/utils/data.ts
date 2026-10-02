import { formatNullable } from "metabase/utils/formatting";
import {
  type DatasetData,
  type RowValue,
  getRowsForStableKeys,
} from "metabase-types/api";

import type {
  CartesianChartColumns,
  ColumnDescriptor,
} from "../../lib/graph/columns";
import type { ComputedVisualizationSettings } from "../../types";
import type { GroupedDatum, Series, SeriesInfo } from "../types/data";
import type { ColumnFormatter } from "../types/format";

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
): Series<GroupedDatum, SeriesInfo>[] => {
  return Array.from(breakoutValues.entries()).map(
    ([breakoutKey, displayValue]) => {
      const customName = settings?.series_settings?.[breakoutKey]?.title;
      return {
        seriesKey: breakoutKey,
        seriesName: customName ?? displayValue,
        yAccessor: (datum: GroupedDatum) =>
          formatNullable(
            typeof datum.dimensionValue === "object"
              ? JSON.stringify(datum.dimensionValue)
              : datum.dimensionValue,
          ),
        xAccessor: (datum: GroupedDatum) =>
          datum.breakout?.[breakoutKey]?.metrics[metric.column.name] ?? null,
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
): Series<GroupedDatum, SeriesInfo>[] => {
  return metrics.map((metric) => {
    const seriesKey = metric.column.name;
    const customName = settings?.series_settings?.[seriesKey]?.title;
    const defaultName = metric.column.display_name ?? metric.column.name;
    return {
      seriesKey,
      seriesName: customName ?? defaultName,
      yAccessor: (datum: GroupedDatum) =>
        datum.dimensionValue !== null &&
        typeof datum.dimensionValue === "object"
          ? JSON.stringify(datum.dimensionValue)
          : datum.dimensionValue,
      xAccessor: (datum: GroupedDatum) => datum.metrics[metric.column.name],
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
): Series<GroupedDatum, SeriesInfo>[] => {
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
