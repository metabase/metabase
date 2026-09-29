import { t } from "ttag";

import { getCollectionPathAsString } from "metabase/common/collections/utils";
import type { SortingOptions } from "metabase-types/api";

import type { MetricResult, SortColumn } from "./types";

export const getMetricDescription = (item: MetricResult) => {
  if (item.collection && !item.description?.trim()) {
    return t`A metric`;
  }

  return item.description;
};

const getValueForSorting = (
  metric: MetricResult,
  sortColumn: SortColumn,
): string => {
  if (sortColumn === "collection") {
    return getCollectionPathAsString(metric.collection) ?? "";
  } else {
    return metric[sortColumn] ?? "";
  }
};

export const getSecondarySortColumn = (sortColumn: SortColumn): SortColumn => {
  return sortColumn === "name" ? "collection" : "name";
};

export function sortMetrics(
  metrics: MetricResult[],
  sortingOptions: SortingOptions<SortColumn>,
) {
  const { sort_column, sort_direction } = sortingOptions;

  const compare = (a: string, b: string) => a.localeCompare(b);

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

    return sort_direction === "asc" ? result : -result;
  });
}
