import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

import { definePluginSlot } from "../slot";

export type SearchSettingsWidgetProps = {
  statusPollingInterval?: number;
};

const getDefaultPluginSemanticSearch = () => ({
  SearchSettingsWidget: PluginPlaceholder<SearchSettingsWidgetProps>,
});

export const PLUGIN_SEMANTIC_SEARCH = definePluginSlot(
  getDefaultPluginSemanticSearch,
);
