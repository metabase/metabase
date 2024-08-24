import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import { useAsync } from "react-use";
import _ from "underscore";

import type { LoadableResult } from "metabase/components/Loading/types";
import { CacheConfigApi } from "metabase/services";
import type {
  CacheConfig,
  CacheConfigAPIResponse,
  CacheableModel,
} from "metabase-types/api";

import { rootId } from "../constants/simple";
import { translateConfigFromAPI } from "../utils";

import { useRecentlyTrue } from "./useRecentlyTrue";

type CacheConfigsData = LoadableResult & {
  configs: CacheConfig[];
  setConfigs: Dispatch<SetStateAction<CacheConfig[]>>;
  configsFromAPI?: CacheConfig[];
  rootStrategyOverriddenOnce: boolean;
  rootStrategyRecentlyOverridden: boolean;
};

export const useCacheConfigs = ({
  configurableModels,
  id,
}: {
  configurableModels: CacheableModel[];
  id?: number;
}): CacheConfigsData => {
  const configsApiResult = useAsync(async () => {
    const configsForEachModel = await Promise.all(
      configurableModels.map(model =>
        CacheConfigApi.list({ model, id }).then(
          (response: CacheConfigAPIResponse) => response.data,
        ),
      ),
    );
    const configs = _.flatten(configsForEachModel);
    const translatedConfigs = configs.map(translateConfigFromAPI);
    return translatedConfigs;
  }, [configurableModels, id]);

  const configsFromAPI = configsApiResult.value;

  const [configs, setConfigs] = useState<CacheConfig[]>([]);

  const rootStrategyOverriddenOnce = configs.some(
    config => config.model_id !== rootId,
  );

  const [rootStrategyRecentlyOverridden] = useRecentlyTrue(
    rootStrategyOverriddenOnce,
    3000,
  );

  const error = configsApiResult.error;

  // The configs are not considered fully loaded until the cache configuration data
  // has been loaded from the API _and_ has been copied into local state
  const [areConfigsInitialized, setAreConfigsInitialized] =
    useState<boolean>(false);
  const isLoading = configsApiResult.loading || !areConfigsInitialized;

  useEffect(() => {
    if (configsFromAPI) {
      setConfigs(configsFromAPI);
      setAreConfigsInitialized(true);
    }
  }, [configsFromAPI]);

  return {
    error,
    isLoading,
    configs,
    setConfigs,
    configsFromAPI,
    rootStrategyOverriddenOnce,
    rootStrategyRecentlyOverridden,
  };
};
