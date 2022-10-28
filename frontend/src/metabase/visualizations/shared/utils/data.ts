import { t } from "ttag";
import { RowValue, RowValues, SeriesOrderSetting } from "metabase-types/api";

import {
  ChartColumns,
  ColumnDescriptor,
  getColumnDescriptors,
} from "metabase/visualizations/lib/graph/columns";
import { ColumnFormatter } from "metabase/visualizations/shared/types/format";
import {
  GroupedDataset,
  GroupedDatum,
  MetricDatum,
  MetricValue,
  SeriesInfo,
  TwoDimensionalChartData,
} from "metabase/visualizations/shared/types/data";
import { Series } from "metabase/visualizations/shared/components/RowChart/types";
import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { isMetric } from "metabase-lib/types/utils/isa";

const getMetricValue = (value: RowValue): MetricValue => {
  if (typeof value === "number") {
    return value;
  }

  return null;
};

const sumMetrics = (left: MetricDatum, right: MetricDatum): MetricDatum => {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return Array.from(keys).reduce<MetricDatum>((datum, metricKey) => {
    const leftValue = left[metricKey];
    const rightValue = right[metricKey];

    if (typeof leftValue === "number" || typeof rightValue === "number") {
      datum[metricKey] = (leftValue ?? 0) + (rightValue ?? 0);
    } else {
      datum[metricKey] = null;
    }

    return datum;
  }, {});
};

const groupDataByDimensions = (
  rows: RowValues[],
  chartColumns: ChartColumns,
  allMetrics: ColumnDescriptor[],
  columnFormatter: ColumnFormatter,
): GroupedDataset => {
  const { dimension } = chartColumns;

  const groupedData = new Map<RowValue, GroupedDatum>();

  for (const row of rows) {
    const dimensionValue = row[dimension.index];

    const datum = groupedData.get(dimensionValue) ?? {
      dimensionValue,
      metrics: {},
    };

    const rowMetrics = allMetrics.reduce<MetricDatum>((datum, metric) => {
      datum[metric.column.name] = getMetricValue(row[metric.index]);
      return datum;
    }, {});

    datum.metrics = sumMetrics(rowMetrics, datum.metrics);

    if ("breakout" in chartColumns) {
      const breakoutName = columnFormatter(
        row[chartColumns.breakout.index],
        chartColumns.breakout.column,
      );

      datum.breakout = {
        ...datum.breakout,
        [breakoutName]: sumMetrics(
          rowMetrics,
          datum.breakout?.[breakoutName] ?? {},
        ),
      };
    }

    groupedData.set(dimensionValue, datum);
  }

  return Array.from(groupedData.values());
};

export const getGroupedDataset = (
  data: TwoDimensionalChartData,
  chartColumns: ChartColumns,
  columnFormatter: ColumnFormatter,
): GroupedDataset => {
  // We are grouping all metrics because they are used in chart tooltips
  const allMetricColumns = data.cols
    .filter(isMetric)
    .map(column => column.name);

  const allMetricDescriptors = getColumnDescriptors(
    allMetricColumns,
    data.cols,
  );

  return groupDataByDimensions(
    data.rows,
    chartColumns,
    allMetricDescriptors,
    columnFormatter,
  );
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

        groupedValue.breakout[breakoutName] = sumMetrics(
          groupedValue.breakout[breakoutName] ?? {},
          currentValue.breakout?.[breakoutName] ?? {},
        );
      });

      return groupedValue;
    },
    {
      dimensionValue: groupedDatumDimensionValue,
      metrics: {},
    },
  );

  return [...result, groupedValuesDatum];
};

const getBreakoutDistinctValues = (
  data: TwoDimensionalChartData,
  breakout: ColumnDescriptor,
  columnFormatter: ColumnFormatter,
) => {
  return Array.from(
    new Set(
      data.rows.map(row =>
        columnFormatter(row[breakout.index], breakout.column),
      ),
    ),
  );
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
      yAccessor: (datum: GroupedDatum) =>
        datum.dimensionValue == null
          ? NULL_DISPLAY_VALUE
          : datum.dimensionValue,
      xAccessor: (datum: GroupedDatum) =>
        datum.breakout?.[breakoutName]?.[metric.column.name] ?? null,
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
      yAccessor: (datum: GroupedDatum) =>
        datum.dimensionValue != null ? datum.dimensionValue : "null",
      xAccessor: (datum: GroupedDatum) => datum.metrics[metric.column.name],
      seriesInfo: {
        dimensionColumn: dimension.column,
        metricColumn: metric.column,
      },
    };
  });
};

export const getSeries = (
  data: TwoDimensionalChartData,
  chartColumns: ChartColumns,
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
  if (seriesOrder == null) {
    return series;
  }

  return seriesOrder
    .filter(orderSetting => orderSetting.enabled)
    .map(orderSetting => series[orderSetting.originalIndex]);
};
