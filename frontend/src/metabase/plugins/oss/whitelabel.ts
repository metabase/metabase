import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

const getDefaultPluginWhitelabel = () => ({
  WhiteLabelBrandingSettingsPage: PluginPlaceholder,
  WhiteLabelConcealSettingsPage: PluginPlaceholder,
});

export const PLUGIN_WHITELABEL = getDefaultPluginWhitelabel();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_WHITELABEL, getDefaultPluginWhitelabel());
}
