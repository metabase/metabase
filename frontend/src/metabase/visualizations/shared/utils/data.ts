import { t } from "ttag";

import { formatNullable } from "metabase/lib/formatting/nullable";
import { getColumnScaling } from "metabase/visualizations/echarts/cartesian/model/util";
import { sumMetric } from "metabase/visualizations/lib/dataset";
import type {
  CartesianChartColumns,
  ColumnDescriptor,
} from "metabase/visualizations/lib/graph/columns";
import type { Series } from "metabase/visualizations/shared/components/RowChart/types";
import type {
  GroupedDataset,
  GroupedDatum,
  MetricDatum,
  MetricValue,
  SeriesInfo,
} from "metabase/visualizations/shared/types/data";
import type { ColumnFormatter } from "metabase/visualizations/shared/types/format";
import type {
  ComputedVisualizationSettings,
  RemappingHydratedDatasetColumn,
} from "metabase/visualizations/types";
import type {
  RowValue,
  RowValues,
  SeriesOrderSetting,
  DatasetData,
} from "metabase-types/api";

import { getChartMetrics } from "./series";

const getMetricValue = (
  value: RowValue,
  metric: RemappingHydratedDatasetColumn,
  settings: ComputedVisualizationSettings,
): MetricValue => {
  const scale = getColumnScaling(metric, settings);

  if (typeof value === "number") {
    return scale * value;
  }

  return null;
};

const sumMetrics = (left: MetricDatum, right: MetricDatum): MetricDatum => {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return Array.from(keys).reduce<MetricDatum>((datum, metricKey) => {
    datum[metricKey] = sumMetric(left[metricKey], right[metricKey]);
    return datum;
  }, {});
};

export const getGroupedDataset = (
  rows: RowValues[],
  chartColumns: CartesianChartColumns,
  settings: ComputedVisualizationSettings,
  columnFormatter: ColumnFormatter,
): GroupedDataset => {
  const { dimension } = chartColumns;

  const groupedData = new Map<RowValue, GroupedDatum>();

  for (const row of rows) {
    const dimensionValue = row[dimension.index];

    const datum = groupedData.get(dimensionValue) ?? {
      dimensionValue,
      metrics: {},
      isClickable: true,
      rawRows: [],
    };

    const rowMetrics = getChartMetrics(chartColumns).reduce<MetricDatum>(
      (datum, metric) => {
        datum[metric.column.name] = getMetricValue(
          row[metric.index],
          metric.column,
          settings,
        );
        return datum;
      },
      {},
    );

    datum.metrics = sumMetrics(rowMetrics, datum.metrics);

    if ("breakout" in chartColumns) {
      const breakoutName = columnFormatter(
        row[chartColumns.breakout.index],
        chartColumns.breakout.column,
      );

      const breakoutRawRows = datum.breakout?.[breakoutName]?.rawRows ?? [];
      breakoutRawRows.push(row);

      const breakoutMetrics = sumMetrics(
        rowMetrics,
        datum.breakout?.[breakoutName]?.metrics ?? {},
      );

      datum.breakout = {
        ...datum.breakout,
        [breakoutName]: {
          metrics: breakoutMetrics,
          rawRows: breakoutRawRows,
        },
      };
    }

    datum.rawRows.push(row);

    groupedData.set(dimensionValue, datum);
  }

  return Array.from(groupedData.values());
};

export const trimData = (
  dataset: GroupedDataset,
  valuesCountLimit: number,
): GroupedDataset => {
  if (dataset.length <= valuesCountLimit) {
    return dataset;
  }

  const groupStartingFromIndex = valuesCountLimit - 1;
  const result = dataset.slice();
  const dataToGroup = result.splice(groupStartingFromIndex);

  const groupedDatumDimensionValue =
    dataToGroup.length === dataset.length
      ? t`All values (${dataToGroup.length})`
      : t`Other (${dataToGroup.length})`;

  const groupedValuesDatum = dataToGroup.reduce(
    (groupedValue, currentValue) => {
      groupedValue.metrics = sumMetrics(
        groupedValue.metrics,
        currentValue.metrics,
      );

      Object.keys(currentValue.breakout ?? {}).map(breakoutName => {
        groupedValue.breakout ??= {};
        groupedValue.breakout[breakoutName] = {
          metrics: sumMetrics(
            groupedValue.breakout[breakoutName]?.metrics ?? {},
            currentValue.breakout?.[breakoutName].metrics ?? {},
          ),
          rawRows: [
            ...(groupedValue.breakout[breakoutName]?.rawRows ?? []),
            ...(currentValue.breakout?.[breakoutName].rawRows ?? []),
          ],
        };
      });

      groupedValue.rawRows.push(...currentValue.rawRows);

      return groupedValue;
    },
    {
      dimensionValue: groupedDatumDimensionValue,
      metrics: {},
      isClickable: false,
      rawRows: [],
    },
  );

  return [...result, groupedValuesDatum];
};

const getBreakoutDistinctValues = (
  data: DatasetData,
  breakout: ColumnDescriptor,
  columnFormatter: ColumnFormatter,
) => {
  const formattedDistinctValues: string[] = [];
  const usedRawValues = new Set<RowValue>();

  data.rows.forEach(row => {
    const rawValue = row[breakout.index];

    if (usedRawValues.has(rawValue)) {
      return;
    }

    usedRawValues.add(rawValue);
    formattedDistinctValues.push(columnFormatter(rawValue, breakout.column));
  });

  return formattedDistinctValues;
};

const getBreakoutSeries = (
  breakoutValues: RowValue[],
  metric: ColumnDescriptor,
  dimension: ColumnDescriptor,
): Series<GroupedDatum, SeriesInfo>[] => {
  return breakoutValues.map(breakoutValue => {
    const breakoutName = String(breakoutValue);
    return {
      seriesKey: breakoutName,
      seriesName: breakoutName,
      yAccessor: (datum: GroupedDatum) => formatNullable(datum.dimensionValue),
      xAccessor: (datum: GroupedDatum) =>
        datum.breakout?.[breakoutName]?.metrics[metric.column.name] ?? null,
      seriesInfo: {
        metricColumn: metric.column,
        dimensionColumn: dimension.column,
        breakoutValue,
      },
    };
  });
};

const getMultipleMetricSeries = (
  dimension: ColumnDescriptor,
  metrics: ColumnDescriptor[],
): Series<GroupedDatum, SeriesInfo>[] => {
  return metrics.map(metric => {
    return {
      seriesKey: metric.column.name,
      seriesName: metric.column.display_name ?? metric.column.name,
      yAccessor: (datum: GroupedDatum) => datum.dimensionValue,
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
    );
  }

  return getMultipleMetricSeries(chartColumns.dimension, chartColumns.metrics);
};

export const getOrderedSeries = (
  series: Series<GroupedDatum, SeriesInfo>[],
  seriesOrder?: SeriesOrderSetting[],
) => {
  if (seriesOrder == null || seriesOrder.length === 0) {
    return series;
  }

  return seriesOrder
    .filter(orderSetting => orderSetting.enabled)
    .map(orderSetting => {
      const foundSeries = series.find(
        singleSeries => singleSeries.seriesKey === orderSetting.key,
      );
      if (foundSeries === undefined) {
        throw new TypeError("Series not found");
      }
      return foundSeries;
    });
};

export const sanatizeResultData = (data: DatasetData) => {
  return {
    ...data,
    cols: data.cols.filter(col => col.expression_name !== "pivot-grouping"),
  };
};
