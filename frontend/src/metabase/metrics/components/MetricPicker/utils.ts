import * as LibMetric from "metabase-lib/metric";
import type { Measure, MeasureId, Metric, MetricId } from "metabase-types/api";

import type {
  MeasureItem,
  MetricOption,
  MetricPickerItem,
  MetricPickerItemType,
} from "./types";

function getItemId(
  id: MetricId | MeasureId,
  type: MetricPickerItemType,
): string {
  return `${type}:${id}`;
}

function getMeasureItem(measure: Measure): MeasureItem {
  return {
    type: "measure",
    data: measure,
    value: getItemId(measure.id, "measure"),
    label: measure.name,
  };
}

function getMetricItem(metric: Metric): MetricOption {
  return {
    type: "metric",
    data: metric,
    value: getItemId(metric.id, "metric"),
    label: metric.name,
  };
}

function getCombinedItems(
  metrics: Metric[],
  measures: Measure[],
): MetricPickerItem[] {
  const items = [
    ...metrics.map(getMetricItem),
    ...measures.map(getMeasureItem),
  ];
  items.sort((a, b) => a.label.localeCompare(b.label));
  return items;
}

function getUnselectedItems(
  items: MetricPickerItem[],
  selectedItemIds: string[],
): MetricPickerItem[] {
  return items.filter((item) => !selectedItemIds.includes(item.value));
}

function getItemIdFromDefinition(
  definition: LibMetric.MetricDefinition,
): string {
  const metricId = LibMetric.sourceMetricId(definition);
  if (metricId != null) {
    return getItemId(metricId, "metric");
  }
  const measureId = LibMetric.sourceMeasureId(definition);
  if (measureId != null) {
    return getItemId(measureId, "measure");
  }
  return "";
}

export function getItems(
  metrics: Metric[],
  measures: Measure[],
  definitions: LibMetric.MetricDefinition[],
): MetricPickerItem[] {
  return getUnselectedItems(
    getCombinedItems(metrics, measures),
    definitions.map(getItemIdFromDefinition),
  );
}
