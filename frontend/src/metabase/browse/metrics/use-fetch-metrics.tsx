import type { SearchRequest } from "metabase-types/api";
import { skipToken, useSearchQuery } from "metabase/api";

export const useFetchMetrics = (
  req: Partial<SearchRequest> | typeof skipToken = {},
) => {
  const modelsResult = useSearchQuery(
    req === skipToken
      ? req
      : {
          models: ["metric"],
          context: "browse",
          ...req,
        },
  );
  return modelsResult;
};
