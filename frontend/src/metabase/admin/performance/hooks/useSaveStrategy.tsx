import type { Dispatch, SetStateAction } from "react";
import { useCallback } from "react";
import _ from "underscore";

import { CacheConfigApi } from "metabase/services";
import type { Config, CacheableModel, Strategy } from "metabase-types/api";

import {
  getFieldsForStrategyType,
  rootId,
  Strategies,
  translateConfigToAPI,
} from "../strategies";

export const useSaveStrategy = (
  targetId: number | null,
  configs: Config[],
  setConfigs: Dispatch<SetStateAction<Config[]>>,
  model: CacheableModel,
) => {
  const saveStrategy = useCallback(
    async (values: Strategy) => {
      if (targetId === null) {
        return;
      }

      const isRoot = targetId === rootId;
      const baseConfig: Pick<Config, "model" | "model_id"> = {
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

        const validatedStrategy =
          Strategies[values.type].validateWith.validateSync(newStrategy);

        const newConfig = {
          ...baseConfig,
          strategy: validatedStrategy,
        };

        const translatedConfig = translateConfigToAPI(newConfig);
        await CacheConfigApi.update(translatedConfig);
        setConfigs([...otherConfigs, newConfig]);
      }
    },
    [configs, setConfigs, targetId, model],
  );
  return saveStrategy;
};
