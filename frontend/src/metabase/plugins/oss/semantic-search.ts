import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

const getDefaultPluginSemanticSearch = () => ({
  SearchSettingsWidget: PluginPlaceholder,
});

export const PLUGIN_SEMANTIC_SEARCH = getDefaultPluginSemanticSearch();

export function reinitialize() {
  Object.assign(PLUGIN_SEMANTIC_SEARCH, getDefaultPluginSemanticSearch());
}
