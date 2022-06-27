import { PLUGIN_MODEL_PERSISTENCE } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import ModelCacheControl from "./components/ModelCacheControl";

if (hasPremiumFeature("advanced_config")) {
  PLUGIN_MODEL_PERSISTENCE.isModelLevelPersistenceEnabled = () => true;

  PLUGIN_MODEL_PERSISTENCE.ModelCacheControl = ModelCacheControl;
}
