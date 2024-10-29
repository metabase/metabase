import { skipToken, useSearchQuery } from "metabase/api";
import type { SearchRequest } from "metabase-types/api";

export const useFetchModels = (
  req: Partial<SearchRequest> | typeof skipToken = {},
) => {
  const modelsResult = useSearchQuery(
    req === skipToken
      ? req
      : {
          models: ["dataset"], // 'model' in the sense of 'type of thing'
          filter_items_in_personal_collection: "exclude",
          model_ancestors: false,
          ...req,
        },
  );
  return modelsResult;
};
