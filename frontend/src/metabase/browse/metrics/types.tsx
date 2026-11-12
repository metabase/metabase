import type { RecentCollectionItem, SearchResult } from "metabase-types/api";

/**
 * Metric retrieved through the search endpoint
 */
export type MetricResult = SearchResult<number, "metric">;

export interface RecentMetric extends RecentCollectionItem {
  model: "metric";
}

export type SortColumn = "name" | "collection" | "description";
