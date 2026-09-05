import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

const getDefaultPluginWhitelabel = () => ({
  WhiteLabelBrandingSettingsPage: PluginPlaceholder,
  WhiteLabelConcealSettingsPage: PluginPlaceholder,
  // The subset of the whitelabel appearance settings that show up inside an
  // embed, for the embedding hub's Appearance tab.
  EmbeddedAppearanceSettings: PluginPlaceholder,
});

export const PLUGIN_WHITELABEL = getDefaultPluginWhitelabel();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_WHITELABEL, getDefaultPluginWhitelabel());
}
