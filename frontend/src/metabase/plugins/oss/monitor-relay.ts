import { pluginPlaceholderRoute } from "metabase/plugins/components/PluginPlaceholder";
import type { PluginRoute } from "metabase/plugins/types";

import { definePluginSlot } from "../slot";

type MonitorRelayPlugin = {
  isEnabled: boolean;
  settingsPage: PluginRoute;
};

const getDefaultPlugin = (): MonitorRelayPlugin => ({
  isEnabled: false,
  settingsPage: pluginPlaceholderRoute,
});

export const PLUGIN_MONITOR_RELAY = definePluginSlot(getDefaultPlugin);
