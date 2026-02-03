import { skipToken, useSearchQuery } from "metabase/api";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import type { SearchResult } from "metabase-types/api";

type MetricOrMeasureResult = SearchResult<number, "metric" | "measure">;

interface UseMetricMeasureSearchResult {
  /** null when not searching, empty array when search returned no results */
  results: MetricOrMeasureResult[] | null;
  isLoading: boolean;
  error: Error | null;
  isSearching: boolean;
}

/**
 * Hook that searches for both metrics and measures.
 * Returns a combined result array.
 * Returns null for results when not searching, empty array when search returned no results.
 */
export function useMetricMeasureSearch(
  searchText: string,
): UseMetricMeasureSearchResult {
  const debouncedSearchText = useDebouncedValue(searchText, 300);
  const isSearching = !!debouncedSearchText;

  const { data, isLoading, error } = useSearchQuery(
    isSearching
      ? { q: debouncedSearchText, models: ["metric", "measure"], limit: 10 }
      : skipToken,
  );

  return {
    results: isSearching
      ? ((data?.data ?? []) as MetricOrMeasureResult[])
      : null,
    isLoading,
    error: error instanceof Error ? error : null,
    isSearching,
  };
}
