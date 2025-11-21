import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

const getDefaultPluginSemanticSearch = () => ({
  SearchSettingsWidget: PluginPlaceholder,
});

export const PLUGIN_SEMANTIC_SEARCH = getDefaultPluginSemanticSearch();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_SEMANTIC_SEARCH, getDefaultPluginSemanticSearch());
}
