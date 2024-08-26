import { useSearchQuery } from "metabase/api";
import type { SearchRequest } from "metabase-types/api";

export const useFetchMetrics = (req: Partial<SearchRequest> = {}) => {
  const modelsResult = useSearchQuery({
    models: ["metric"],
    filter_items_in_personal_collection: "exclude",
    model_ancestors: false,
    ...req,
  });
  return modelsResult;
};
