import { useSearchQuery } from "metabase/api";
import type { SearchRequest } from "metabase-types/api";

export const useFetchMetrics = (req: Partial<SearchRequest> = {}) => {
  const modelsResult = useSearchQuery({
    models: ["metric"],
    ...req,
  });
  return modelsResult;
};
