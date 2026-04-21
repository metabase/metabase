import { useListCacheConfigsQuery } from "metabase/api";
import type { ListCacheConfigsRequest } from "metabase-types/api";

import { rootId } from "../constants/simple";
import { translateConfigFromAPI } from "../utils";

import { useRecentlyTrue } from "./useRecentlyTrue";

export const useCacheConfigs = (
  listCacheConfigsRequest: ListCacheConfigsRequest,
) => {
  const {
    data: listCacheConfigsResponse,
    error,
    isLoading,
  } = useListCacheConfigsQuery(listCacheConfigsRequest);

  const configs = listCacheConfigsResponse?.data.map(translateConfigFromAPI);

  const rootStrategyOverriddenOnce =
    configs !== undefined &&
    configs.some((config) => config.model_id !== rootId);

  const [rootStrategyRecentlyOverridden] = useRecentlyTrue(
    rootStrategyOverriddenOnce,
    3000,
  );

  return {
    error,
    isLoading,
    configs,
    total: listCacheConfigsResponse?.total,
    rootStrategyOverriddenOnce,
    rootStrategyRecentlyOverridden,
  };
};
