import { PLUGIN_MODEL_PERSISTENCE } from "metabase/plugins";

import ModelCacheControl from "./components/ModelCacheControl";

PLUGIN_MODEL_PERSISTENCE.isModelLevelPersistenceEnabled = () => true;

PLUGIN_MODEL_PERSISTENCE.ModelCacheControl = ModelCacheControl;
