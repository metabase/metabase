import { skipToken, useSearchQuery } from "metabase/api";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import type { CardId, MeasureId, SearchResult } from "metabase-types/api";

interface UseMetricMeasureSearchResult {
  /** null when not searching, empty array when search returned no results */
  metricResults: SearchResult<CardId, "metric">[] | null;
  /** null when not searching, empty array when search returned no results */
  measureResults: SearchResult<MeasureId, "measure">[] | null;
  isLoading: boolean;
  error: Error | null;
  isSearching: boolean;
}

/**
 * Hook that searches for both metrics and measures in parallel.
 * Returns separate result arrays for each type.
 * Returns null for results when not searching, empty array when search returned no results.
 */
export function useMetricMeasureSearch(
  searchText: string,
): UseMetricMeasureSearchResult {
  const debouncedSearchText = useDebouncedValue(searchText, 300);
  const isSearching = !!debouncedSearchText;

  const {
    data: metricData,
    isLoading: loadingMetrics,
    error: metricError,
  } = useSearchQuery(
    isSearching
      ? { q: debouncedSearchText, models: ["metric"], limit: 5 }
      : skipToken,
  );

  const {
    data: measureData,
    isLoading: loadingMeasures,
    error: measureError,
  } = useSearchQuery(
    isSearching
      ? { q: debouncedSearchText, models: ["measure"], limit: 5 }
      : skipToken,
  );

  const rawError = metricError || measureError;

  return {
    // Return null when not searching to distinguish from "no results"
    metricResults: isSearching
      ? ((metricData?.data ?? []) as SearchResult<CardId, "metric">[])
      : null,
    measureResults: isSearching
      ? ((measureData?.data ?? []) as SearchResult<MeasureId, "measure">[])
      : null,
    isLoading: loadingMetrics || loadingMeasures,
    error: rawError instanceof Error ? rawError : null,
    isSearching,
  };
}
