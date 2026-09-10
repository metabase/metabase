import { definePluginSlot } from "metabase/plugins/slot";

export const PLUGIN_SDK_INITIALIZATION = definePluginSlot(() => ({
  initialized: false,
}));
