import { useSearchQuery } from "metabase/api";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import type { SearchResult } from "metabase-types/api";

export type MetricOrMeasureResult = SearchResult<number, "metric" | "measure">;

type UseMetricMeasureSearchResult = {
  results: MetricOrMeasureResult[];
  isLoading: boolean;
  error: Error | null;
};

export function useMetricMeasureSearch(
  searchText: string,
): UseMetricMeasureSearchResult {
  const trimmed = searchText.trim();
  const debouncedSearchText = useDebouncedValue(trimmed, 300);
  const effectiveText = trimmed === "" ? "" : debouncedSearchText;

  const { data, isLoading, error } = useSearchQuery({
    ...(effectiveText ? { q: effectiveText } : {}),
    models: ["metric", "measure"],
    filter_items_in_personal_collection: "exclude",
    model_ancestors: false,
    limit: 5,
  });

  return {
    results: (data?.data ?? []) as MetricOrMeasureResult[],
    isLoading,
    error: error instanceof Error ? error : null,
  };
}
