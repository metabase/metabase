import { definePluginSlot } from "metabase/plugins";

export const PLUGIN_SDK_INITIALIZATION = definePluginSlot(() => ({
  initialized: false,
}));
