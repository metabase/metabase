import { useSearchQuery } from "metabase/api";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import type { SearchResult } from "metabase-types/api";

export type MetricOrMeasureResult = SearchResult<number, "metric" | "measure">;

type UseMetricMeasureSearchResult = {
  results: MetricOrMeasureResult[];
  isLoading: boolean;
  error: Error | null;
};

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_RESULTS_LIMIT = 5;

export function useMetricMeasureSearch(
  searchText: string,
): UseMetricMeasureSearchResult {
  const trimmed = searchText.trim();
  const debouncedSearchText = useDebouncedValue(trimmed, SEARCH_DEBOUNCE_MS);
  const effectiveText = trimmed === "" ? "" : debouncedSearchText;

  const { data, isLoading, error } = useSearchQuery({
    ...(effectiveText ? { q: effectiveText } : {}),
    models: ["metric", "measure"],
    filter_items_in_personal_collection: "exclude",
    model_ancestors: false,
    limit: SEARCH_RESULTS_LIMIT,
  });

  return {
    results: (data?.data ?? []) as MetricOrMeasureResult[],
    isLoading,
    error: error instanceof Error ? error : null,
  };
}
