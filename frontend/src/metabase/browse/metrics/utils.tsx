import { t } from "ttag";

import { getCollectionPathAsString } from "metabase/collections/utils";
import { formatValue } from "metabase/lib/formatting";
import { isDate } from "metabase-lib/v1/types/utils/isa";
import type { Dataset } from "metabase-types/api";
import { SortDirection, type SortingOptions } from "metabase-types/api/sorting";

import type { MetricResult } from "./types";

export const getMetricDescription = (item: MetricResult) => {
  if (item.collection && !item.description?.trim()) {
    return t`A metric`;
  }

  return item.description;
};

const getValueForSorting = (
  metric: MetricResult,
  sort_column: keyof MetricResult,
): string => {
  if (sort_column === "collection") {
    return getCollectionPathAsString(metric.collection) ?? "";
  } else {
    return metric[sort_column] ?? "";
  }
};

export const isValidSortColumn = (
  sort_column: string,
): sort_column is keyof MetricResult => {
  return ["name", "collection", "description"].includes(sort_column);
};

export const getSecondarySortColumn = (
  sort_column: string,
): keyof MetricResult => {
  return sort_column === "name" ? "collection" : "name";
};

export function sortMetrics(
  metrics: MetricResult[],
  sortingOptions: SortingOptions,
  localeCode: string = "en",
) {
  const { sort_column, sort_direction } = sortingOptions;

  if (!isValidSortColumn(sort_column)) {
    console.error("Invalid sort column", sort_column);
    return metrics;
  }

  const compare = (a: string, b: string) =>
    a.localeCompare(b, localeCode, { sensitivity: "base" });

  return [...metrics].sort((metricA, metricB) => {
    const a = getValueForSorting(metricA, sort_column);
    const b = getValueForSorting(metricB, sort_column);

    let result = compare(a, b);
    if (result === 0) {
      const sort_column2 = getSecondarySortColumn(sort_column);
      const a2 = getValueForSorting(metricA, sort_column2);
      const b2 = getValueForSorting(metricB, sort_column2);
      result = compare(a2, b2);
    }

    return sort_direction === SortDirection.Asc ? result : -result;
  });
}

export function isDatasetScalar(dataset: Dataset) {
  if (dataset.error) {
    return false;
  }
  return dataset.data.cols.length === 1 && dataset.data.rows.length === 1;
}

export function isDatasetTemporalMetric(dataset: Dataset) {
  if (dataset.error) {
    return false;
  }

  const cols = dataset.data.cols;
  if (cols.length !== 2) {
    return false;
  }

  const col = cols[0];

  // TODO(romeovs): isDate should not be used but there is not easy alternative for now
  if (!isDate(col)) {
    return false;
  }

  return true;
}

export function getDatasetValueForMetric(dataset: Dataset) {
  if (isDatasetScalar(dataset)) {
    return getMetricValueForScalarMetric(dataset);
  }
  if (isDatasetTemporalMetric(dataset)) {
    return getMetricValueForTemporalMetric(dataset);
  }
  return null;
}

export function getMetricValueForScalarMetric(dataset: Dataset) {
  const { cols, rows } = dataset.data;

  const lastRow = rows?.at(-1) ?? [];

  const [value] = lastRow;
  const [valueColumn] = cols;

  if (value === undefined) {
    return null;
  }

  return {
    label: t`Overall`,
    value: formatValue(value, {
      jsx: true,
      rich: true,
      column: valueColumn,
    }),
  };
}

export function getMetricValueForTemporalMetric(dataset: Dataset) {
  // This returns the last row of the dataset, which usually represents the latest
  // value of a metric with a temporal breakout.
  // However, if the metric has values in the future, or a sort clause that changes
  // the order of the rows, this will not return the latest value per se.
  const { cols, rows } = dataset.data;

  if (!rows || rows.length < 1) {
    return null;
  }

  const lastRow = rows?.at(-1);
  if (!lastRow) {
    return null;
  }

  const [label, value] = lastRow;
  const [labelColumn, valueColumn] = cols;

  if (value === undefined) {
    return null;
  }

  return {
    label: formatValue(label, {
      jsx: true,
      rich: true,
      column: labelColumn,
    }),
    value: formatValue(value, {
      jsx: true,
      rich: true,
      column: valueColumn,
    }),
  };
}
