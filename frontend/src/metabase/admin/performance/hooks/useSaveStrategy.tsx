import { useCallback } from "react";
import _ from "underscore";

import {
  useDeleteCacheConfigsMutation,
  useUpdateCacheConfigMutation,
} from "metabase/api";
import { PLUGIN_CACHING } from "metabase/plugins";
import type {
  CacheConfig,
  CacheStrategy,
  CacheableModel,
} from "metabase-types/api";

import { rootId } from "../constants/simple";
import {
  getFieldsForStrategyType,
  getStrategyValidationSchema,
  populateMinDurationSeconds,
  translateConfigToAPI,
} from "../utils";

export const useSaveStrategy = (
  targetId: number | null,
  model: CacheableModel | null,
) => {
  const [updateCacheConfig] = useUpdateCacheConfigMutation();
  const [deleteCacheConfigs] = useDeleteCacheConfigsMutation();

  const saveStrategy = useCallback(
    async (values: CacheStrategy) => {
      if (targetId === null || model === null) {
        return;
      }
      const { strategies } = PLUGIN_CACHING;

      const isRoot = targetId === rootId;
      const baseConfig: Pick<CacheConfig, "model" | "model_id"> = {
        model: isRoot ? "root" : model,
        model_id: targetId,
      };
      const shouldDeleteStrategy =
        values.type === "inherit" ||
        // To set "don't cache" as the root strategy, we delete the root strategy
        (isRoot && values.type === "nocache");
      if (shouldDeleteStrategy) {
        await deleteCacheConfigs(baseConfig).unwrap();
      } else {
        // If you change strategies, Formik will keep the old values
        // for fields that are not in the new strategy,
        // so let's remove these fields
        const validFields = getFieldsForStrategyType(values.type);
        const newStrategy = _.pick(values, validFields) as CacheStrategy;

        const strategyData = strategies[values.type];
        const strategySchema = getStrategyValidationSchema(strategyData);
        const validatedStrategy = strategySchema.validateSync(newStrategy);

        const newConfig: CacheConfig = {
          ...baseConfig,
          strategy: validatedStrategy,
        };

        const translatedConfig = translateConfigToAPI(newConfig);
        await updateCacheConfig(translatedConfig).unwrap();

        if (newConfig.strategy.type === "ttl") {
          newConfig.strategy = populateMinDurationSeconds(newConfig.strategy);
        }
      }
    },
    [targetId, model, updateCacheConfig, deleteCacheConfigs],
  );
  return saveStrategy;
};
