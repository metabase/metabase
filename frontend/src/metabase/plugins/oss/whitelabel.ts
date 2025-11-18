import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

const getDefaultPluginWhitelabel = () => ({
  WhiteLabelBrandingSettingsPage: PluginPlaceholder,
  WhiteLabelConcealSettingsPage: PluginPlaceholder,
});

export const PLUGIN_WHITELABEL = getDefaultPluginWhitelabel();

export function reinitialize() {
  Object.assign(PLUGIN_WHITELABEL, getDefaultPluginWhitelabel());
}
