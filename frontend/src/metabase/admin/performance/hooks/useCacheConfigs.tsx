import { skipToken } from "@reduxjs/toolkit/query";
import { useEffect, useMemo, useState } from "react";
import _ from "underscore";

import { useListCacheConfigsQuery } from "metabase/api/cache";
import type { CacheConfig, CacheableModel } from "metabase-types/api";

import { rootId } from "../constants/simple";
import { translateConfigFromAPI } from "../utils";

import { useRecentlyTrue } from "./useRecentlyTrue";

const useListCacheConfigsForModel = (
  models: CacheableModel[],
  model: CacheableModel,
  id?: number,
) =>
  useListCacheConfigsQuery(
    models.includes(model)
      ? {
          model,
          id,
        }
      : skipToken,
  );

export const useCacheConfigs = ({
  models,
  id,
}: {
  models: CacheableModel[];
  id?: number;
}) => {
  const rootResult = useListCacheConfigsForModel(models, "root", id);
  const databasesResult = useListCacheConfigsForModel(models, "database", id);
  const dashboardsResult = useListCacheConfigsForModel(models, "dashboard", id);
  const questionsResult = useListCacheConfigsForModel(models, "question", id);

  const { configsFromAPI, isFetching, error } = useMemo(() => {
    const results = [
      rootResult,
      databasesResult,
      dashboardsResult,
      questionsResult,
    ];
    const configsFromAPI = results.map(result => result.data?.data);
    const error = results.find(result => result.error)?.error;
    const isFetching = results.some(result => result.isFetching);
    return { configsFromAPI, isFetching, error };
  }, [rootResult, databasesResult, dashboardsResult, questionsResult]);

  const [configs, setConfigs] = useState<CacheConfig[]>([]);

  const rootStrategyOverriddenOnce = configs.some(
    config => config.model_id !== rootId,
  );

  const [rootStrategyRecentlyOverridden] = useRecentlyTrue(
    rootStrategyOverriddenOnce,
    3000,
  );

  // The configs are not considered fully loaded until the cache configuration data
  // has been loaded from the API _and_ has been copied into local state
  const [areConfigsInitialized, setAreConfigsInitialized] =
    useState<boolean>(false);
  const loading = isFetching || !areConfigsInitialized;

  useEffect(() => {
    if (configsFromAPI) {
      const flattenedConfigs = _.compact(configsFromAPI.flat());
      const translatedConfigs = flattenedConfigs.map(translateConfigFromAPI);
      setConfigs(translatedConfigs);
      setAreConfigsInitialized(true);
    }
  }, [configsFromAPI]);

  return {
    error,
    loading,
    configs,
    setConfigs,
    rootStrategyOverriddenOnce,
    rootStrategyRecentlyOverridden,
  };
};
