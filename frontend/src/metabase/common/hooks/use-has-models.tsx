import type { SearchRequest } from "metabase-types/api";

import { useFetchModels } from "./use-fetch-models";

/** NOTE: hasModels is undefined when the request is pending */
export const useHasModels = (req: Partial<SearchRequest> = {}) => {
  const modelsResult = useFetchModels({
    limit: 1,
    model_ancestors: false,
    ...req,
  });
  const modelsLength = modelsResult.data?.data.length;
  return {
    hasModels: modelsLength === undefined ? undefined : modelsLength !== 0,
    isLoading: modelsResult.isLoading,
    error: modelsResult.error,
  };
};
