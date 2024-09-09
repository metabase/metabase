import { useFetchMetrics } from "metabase/common/hooks/use-fetch-metrics";
import type { SearchRequest } from "metabase-types/api";

export const useHasMetrics = (req: Partial<SearchRequest> = {}) => {
  const { data, isLoading, error } = useFetchMetrics({
    limit: 0,
    filter_items_in_personal_collection: "exclude",
    model_ancestors: false,
    ...req,
  });

  const availableModels = data?.available_models ?? [];
  const hasMetrics = availableModels.includes("metric");

  return {
    hasMetrics,
    isLoading,
    error,
  };
};
