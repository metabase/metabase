import { definePluginSlot } from "metabase/plugin-slots";

import { useGetIconBase } from "./use-icon";

export const PLUGIN_ENTITY_ICON = definePluginSlot(() => ({
  useGetIcon: () => useGetIconBase(),
}));
