import type { SearchRequest } from "metabase-types/api";

import { useFetchMetrics } from "./use-fetch-metrics";

/** NOTE: hasModels is undefined when the request is pending */
export const useHasMetrics = (req: Partial<SearchRequest> = {}) => {
  const metricsResult = useFetchMetrics({
    limit: 1,
    model_ancestors: false,
    ...req,
  });
  const metricsLength = metricsResult.data?.data.length;
  return {
    hasMetrics: metricsLength === undefined ? undefined : metricsLength !== 0,
    isLoading: metricsResult.isLoading,
    error: metricsResult.error,
  };
};
