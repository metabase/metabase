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

/**
 * The settings page for Metabase Monitor, an external appliance that this
 * instance sends its app DB rows to. Not the Monitor app (PLUGIN_MONITOR).
 */
export const PLUGIN_MONITOR_RELAY = definePluginSlot(getDefaultPlugin);
