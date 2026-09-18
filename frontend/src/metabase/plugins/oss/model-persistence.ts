import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type Question from "metabase-lib/v1/Question";
import type { ModelCacheRefreshStatus } from "metabase-types/api";

import { definePluginSlot } from "../slot";

const getDefaultPluginModelPersistence = () => ({
  isModelLevelPersistenceEnabled: () => false,
  // Unjustified type cast. FIXME
  ModelCacheToggle: PluginPlaceholder as ({
    persistedModel,
    model,
  }: {
    persistedModel?: ModelCacheRefreshStatus;
    model: Question;
  }) => JSX.Element,
});

export const PLUGIN_MODEL_PERSISTENCE = definePluginSlot(
  getDefaultPluginModelPersistence,
);
