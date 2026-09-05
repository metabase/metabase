import { definePluginSlot } from "metabase/plugins";

import { useGetIconBase } from "./use-icon";

export const PLUGIN_ENTITY_ICON = definePluginSlot(() => ({
  useGetIcon: () => useGetIconBase(),
}));
