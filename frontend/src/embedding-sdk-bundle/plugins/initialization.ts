import { definePluginSlot } from "metabase/plugin-slots";

export const PLUGIN_SDK_INITIALIZATION = definePluginSlot(() => ({
  initialized: false,
}));
