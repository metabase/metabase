import { t } from "ttag";

import { PLUGIN_MODEL_PERSISTENCE } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import type Question from "metabase-lib/v1/Question";

import ModelCacheControl, {
  toggleModelPersistence,
} from "./components/ModelCacheControl";

if (hasPremiumFeature("cache_granular_controls")) {
  PLUGIN_MODEL_PERSISTENCE.isModelLevelPersistenceEnabled = () => true;

  PLUGIN_MODEL_PERSISTENCE.ModelCacheControl = ModelCacheControl;

  PLUGIN_MODEL_PERSISTENCE.getMenuItems = (
    model: Question,
    onChange?: (isPersisted: boolean) => void,
  ) => {
    const isPersisted = model.isPersisted();

    return {
      title: isPersisted
        ? t`Turn model persistence off`
        : t`Turn model persistence on`,
      action: () => toggleModelPersistence(model, onChange),
      icon: "database",
    };
  };
}
