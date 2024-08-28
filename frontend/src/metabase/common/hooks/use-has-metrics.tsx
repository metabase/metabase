import type { SearchRequest } from "metabase-types/api";

import { useFetchMetrics } from "./use-fetch-metrics";

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
