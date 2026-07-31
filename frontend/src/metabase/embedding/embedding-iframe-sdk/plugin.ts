import type { EmbedAuthManagerConstructor } from "metabase/embedding/embedding-iframe-sdk/types/auth-manager";

export const PLUGIN_EMBED_JS_EE = {
  // Unjustified type cast. FIXME
  EmbedAuthManager: null as EmbedAuthManagerConstructor | null,
};
