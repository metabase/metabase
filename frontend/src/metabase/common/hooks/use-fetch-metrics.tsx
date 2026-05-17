import { skipToken } from "metabase/api/api";
import { useSearchQuery } from "metabase/api/search";
import type { SearchRequest } from "metabase-types/api";

export const useFetchMetrics = (
  req: Partial<SearchRequest> | typeof skipToken = {},
) => {
  const modelsResult = useSearchQuery(
    req === skipToken
      ? req
      : {
          models: ["metric"],
          ...req,
        },
  );
  return modelsResult;
};
