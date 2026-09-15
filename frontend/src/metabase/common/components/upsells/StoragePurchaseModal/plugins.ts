import { definePluginSlot } from "metabase/plugins";

import { StorageSetupProvider } from "./storage-setup-context";

export const PLUGIN_STORAGE_SETUP = definePluginSlot(() => ({
  StorageSetupProvider,
}));
