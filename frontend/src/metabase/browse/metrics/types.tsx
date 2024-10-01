import type { RecentCollectionItem, SearchResult } from "metabase-types/api";

/**
 * Metric retrieved through the search endpoint
 */
export type MetricResult = SearchResult<number, "metric">;

export interface RecentMetric extends RecentCollectionItem {
  model: "metric";
}

export type MetricFilterSettings = {
  verified?: boolean;
};

export type MetricFilterControlsProps = {
  metricFilters: MetricFilterSettings;
  setMetricFilters: (settings: MetricFilterSettings) => void;
};
