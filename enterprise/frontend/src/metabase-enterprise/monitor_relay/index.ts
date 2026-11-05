import { PLUGIN_MONITOR_RELAY } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

const settingsPage = () =>
  import(
    /* webpackChunkName: "metabase-monitor-settings" */ "./MonitorRelaySettingsPage"
  ).then(({ MonitorRelaySettingsPage }) => ({
    Component: MonitorRelaySettingsPage,
  }));

export function initializePlugin() {
  if (hasPremiumFeature("monitor_relay")) {
    PLUGIN_MONITOR_RELAY.isEnabled = true;
    PLUGIN_MONITOR_RELAY.settingsPage = settingsPage;
  }
}
