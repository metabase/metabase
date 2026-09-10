import { definePluginSlot } from "metabase/plugins/slot";

import type { EmbedAuthManagerConstructor } from "./types/auth-manager";

export const PLUGIN_EMBED_JS_EE = definePluginSlot(
  (): { EmbedAuthManager: EmbedAuthManagerConstructor | null } => ({
    EmbedAuthManager: null,
  }),
);
