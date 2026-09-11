import type { SdkDispatch } from "embedding-sdk-bundle/store/types";
import type { MetabaseAuthConfig } from "embedding-sdk-shared/types/auth-config";
import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";
import { definePluginSlot } from "metabase/plugin-slots";

export const PLUGIN_EMBEDDING_SDK_AUTH = definePluginSlot(() => ({
  initAuth: async (
    _config: MetabaseAuthConfig & { isLocalHost?: boolean },
    _context: { dispatch: SdkDispatch },
  ): Promise<void> => {},
  refreshTokenAsync: async (
    _config: MetabaseAuthConfig,
    _context: { getState: () => unknown },
  ): Promise<MetabaseEmbeddingSessionToken | null> => null,
}));
