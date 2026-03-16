import type { SelectedMetric } from "../../types/viewer-state";

export function getSelectedMetricIds(
  selectedMetrics: SelectedMetric[],
): Set<number> {
  return new Set(
    selectedMetrics
      .filter((metric) => metric.sourceType === "metric")
      .map((metric) => metric.id),
  );
}

export function getSelectedMeasureIds(
  selectedMetrics: SelectedMetric[],
): Set<number> {
  return new Set(
    selectedMetrics
      .filter((metric) => metric.sourceType === "measure")
      .map((metric) => metric.id),
  );
}

export type ExcludeMetric = {
  id: number;
  sourceType: "metric" | "measure";
};

type SearchResultLike = {
  id: number;
  model: "metric" | "measure";
};

export function filterSearchResults<T extends SearchResultLike>(
  results: T[],
  selectedMetricIds: Set<number>,
  selectedMeasureIds: Set<number>,
  excludeMetric?: ExcludeMetric,
): T[] {
  return results.filter(
    (result) =>
      (result.model === "metric"
        ? !selectedMetricIds.has(result.id)
        : !selectedMeasureIds.has(result.id)) &&
      (!excludeMetric ||
        result.id !== excludeMetric.id ||
        result.model !== excludeMetric.sourceType),
  );
}
