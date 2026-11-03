import { PLUGIN_MONITOR_RELAY } from "metabase/plugins";

const settingsPage = () =>
  import(
    /* webpackChunkName: "metabase-monitor-settings" */ "./MonitorRelaySettingsPage"
  ).then(({ MonitorRelaySettingsPage }) => ({
    Component: MonitorRelaySettingsPage,
  }));

/**
 * The relay runs in every Enterprise build, whatever the token's features, so
 * its settings page does too.
 */
export function initializePlugin() {
  PLUGIN_MONITOR_RELAY.isEnabled = true;
  PLUGIN_MONITOR_RELAY.settingsPage = settingsPage;
}
