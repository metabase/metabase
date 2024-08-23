import { useSearchQuery } from "metabase/api";
import type { SearchRequest } from "metabase-types/api";

export const useFetchModels = (req: Partial<SearchRequest> = {}) => {
  const modelsResult = useSearchQuery({
    models: ["dataset"], // 'model' in the sense of 'type of thing'
    filter_items_in_personal_collection: "exclude",
    model_ancestors: false,
    ...req,
  });
  return modelsResult;
};
