import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type Question from "metabase-lib/v1/Question";
import type { ModelCacheRefreshStatus } from "metabase-types/api";

const getDefaultPluginModelPersistence = () => ({
  isModelLevelPersistenceEnabled: () => false,
  ModelCacheToggle: PluginPlaceholder as ({
    persistedModel,
    model,
  }: {
    persistedModel?: ModelCacheRefreshStatus;
    model: Question;
  }) => JSX.Element,
});

export const PLUGIN_MODEL_PERSISTENCE = getDefaultPluginModelPersistence();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_MODEL_PERSISTENCE, getDefaultPluginModelPersistence());
}
