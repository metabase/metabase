import type { EmbedAuthManagerConstructor } from "metabase/embedding/embedding-iframe-sdk/types/auth-manager";

export const PLUGIN_EMBED_JS_EE = {
  EmbedAuthManager: null as EmbedAuthManagerConstructor | null,
  bridgeHandleLinkForEmbedJs: (_url: string): Promise<{ handled: boolean }> =>
    Promise.resolve({ handled: false }),
};
