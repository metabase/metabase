import { skipToken } from "metabase/api";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { useFetchMetrics } from "metabase/common/hooks/use-fetch-metrics";
import type { SearchResult } from "metabase-types/api";

interface UseMetricSearchResult {
  /** null when not searching, empty array when search returned no results */
  results: SearchResult[] | null;
  isLoading: boolean;
  error: Error | null;
  isSearching: boolean;
}

export function useMetricSearch(searchText: string): UseMetricSearchResult {
  const debouncedSearchText = useDebouncedValue(searchText, 300);
  const isSearching = !!debouncedSearchText;

  const { data, isLoading, error } = useFetchMetrics(
    isSearching ? { q: debouncedSearchText, limit: 10 } : skipToken,
  );

  return {
    // Return null when not searching to distinguish from "no results"
    results: isSearching ? (data?.data ?? []) : null,
    isLoading,
    error: error instanceof Error ? error : null,
    isSearching,
  };
}
