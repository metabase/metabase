import { useFetchMetrics } from "metabase/common/hooks/use-fetch-metrics";
import type { SearchRequest } from "metabase-types/api";

export const useHasMetrics = (req: Partial<SearchRequest> = {}) => {
  const { data, isLoading, error } = useFetchMetrics({
    limit: 0,
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
