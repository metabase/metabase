import { PLUGIN_MODEL_PERSISTENCE } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { ModelCacheToggle } from "./components/ModelCacheControl";

if (hasPremiumFeature("cache_granular_controls")) {
  PLUGIN_MODEL_PERSISTENCE.ModelCacheToggle = ModelCacheToggle;
}
