import type { Dispatch, SetStateAction } from "react";
import { useCallback } from "react";
import _ from "underscore";

import { PLUGIN_CACHING } from "metabase/plugins";
import { CacheConfigApi } from "metabase/services";
import type {
  Config as CacheConfig,
  CacheableModel,
  Strategy,
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
  configs: CacheConfig[],
  setConfigs: Dispatch<SetStateAction<CacheConfig[]>>,
  model: CacheableModel,
) => {
  const saveStrategy = useCallback(
    async (values: Strategy) => {
      if (targetId === null) {
        return;
      }
      const { strategies } = PLUGIN_CACHING;

      const isRoot = targetId === rootId;
      const baseConfig: Pick<CacheConfig, "model" | "model_id"> = {
        model: isRoot ? "root" : model,
        model_id: targetId,
      };

      const otherConfigs = configs.filter(
        config => config.model_id !== targetId,
      );
      const shouldDeleteStrategy =
        values.type === "inherit" ||
        // To set "don't cache" as the root strategy, we delete the root strategy
        (isRoot && values.type === "nocache");
      if (shouldDeleteStrategy) {
        await CacheConfigApi.delete(baseConfig, { hasBody: true });
        setConfigs(otherConfigs);
      } else {
        // If you change strategies, Formik will keep the old values
        // for fields that are not in the new strategy,
        // so let's remove these fields
        const validFields = getFieldsForStrategyType(values.type);
        const newStrategy = _.pick(values, validFields) as Strategy;

        const strategyData = strategies[values.type];
        const strategySchema = getStrategyValidationSchema(strategyData);
        const validatedStrategy = strategySchema.validateSync(newStrategy);

        const newConfig: CacheConfig = {
          ...baseConfig,
          strategy: validatedStrategy,
        };

        const translatedConfig = translateConfigToAPI(newConfig);
        await CacheConfigApi.update(translatedConfig);

        if (newConfig.strategy.type === "ttl") {
          newConfig.strategy = populateMinDurationSeconds(newConfig.strategy);
        }

        setConfigs([...otherConfigs, newConfig]);
      }
    },
    [configs, setConfigs, targetId, model],
  );
  return saveStrategy;
};
