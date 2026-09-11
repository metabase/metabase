import { definePluginSlot } from "metabase/plugin-slots";

import { StorageSetupProvider } from "./storage-setup-context";

export const PLUGIN_STORAGE_SETUP = definePluginSlot(() => ({
  StorageSetupProvider,
}));
