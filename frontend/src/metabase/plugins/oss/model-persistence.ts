import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type Question from "metabase-lib/v1/Question";
import type { ModelCacheRefreshStatus } from "metabase-types/api";

export const PLUGIN_MODEL_PERSISTENCE = {
  isModelLevelPersistenceEnabled: () => false,
  ModelCacheToggle: PluginPlaceholder as ({
    persistedModel,
    model,
  }: {
    persistedModel?: ModelCacheRefreshStatus;
    model: Question;
  }) => JSX.Element,
};
