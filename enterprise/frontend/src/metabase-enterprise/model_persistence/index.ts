import { PLUGIN_MODEL_PERSISTENCE } from "metabase/plugins";

import ModelCacheControl from "./components/ModelCacheControl";
import ModelCacheManagementSection from "./components/ModelCacheManagementSection";

PLUGIN_MODEL_PERSISTENCE.isModelLevelPersistenceEnabled = () => true;

PLUGIN_MODEL_PERSISTENCE.ModelCacheControl = ModelCacheControl;
PLUGIN_MODEL_PERSISTENCE.ModelCacheManagementSection = ModelCacheManagementSection;
