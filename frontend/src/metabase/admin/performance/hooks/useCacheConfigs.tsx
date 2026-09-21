import { useListCacheConfigsQuery } from "metabase/api";
import type { ListCacheConfigsRequest } from "metabase-types/api";

import { translateConfigFromAPI } from "../utils";

export const useCacheConfigs = (
  listCacheConfigsRequest: ListCacheConfigsRequest,
) => {
  const {
    data: listCacheConfigsResponse,
    error,
    isLoading,
  } = useListCacheConfigsQuery(listCacheConfigsRequest);

  const configs = listCacheConfigsResponse?.data.map(translateConfigFromAPI);

  return {
    error,
    isLoading,
    configs,
  };
};
