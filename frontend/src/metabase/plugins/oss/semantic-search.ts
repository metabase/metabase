import { definePluginSlot } from "metabase/plugin-slots";
import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

export type SearchSettingsWidgetProps = {
  statusPollingInterval?: number;
};

const getDefaultPluginSemanticSearch = () => ({
  SearchSettingsWidget: PluginPlaceholder<SearchSettingsWidgetProps>,
});

export const PLUGIN_SEMANTIC_SEARCH = definePluginSlot(
  getDefaultPluginSemanticSearch,
);
