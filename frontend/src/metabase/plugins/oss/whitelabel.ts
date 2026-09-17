import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

import { definePluginSlot } from "../slot";

const getDefaultPluginWhitelabel = () => ({
  WhiteLabelBrandingSettingsPage: PluginPlaceholder,
  WhiteLabelConcealSettingsPage: PluginPlaceholder,
});

export const PLUGIN_WHITELABEL = definePluginSlot(getDefaultPluginWhitelabel);
