import { definePluginSlot } from "metabase/plugin-slots";
import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

const getDefaultPluginWhitelabel = () => ({
  WhiteLabelBrandingSettingsPage: PluginPlaceholder,
  WhiteLabelConcealSettingsPage: PluginPlaceholder,
  // The subset of the whitelabel appearance settings that show up inside an
  // embed, for the embedding hub's Appearance tab.
  EmbeddedAppearanceSettings: PluginPlaceholder,
});

export const PLUGIN_WHITELABEL = definePluginSlot(getDefaultPluginWhitelabel);
