import { PLUGIN_EMBEDDING_SDK_AUTH } from "embedding-sdk-bundle/store/auth";
import type { SdkStore } from "embedding-sdk-bundle/store/types";
import type { MetabaseAuthConfig } from "embedding-sdk-shared/types/auth-config";

/** Reuse the provider's SSO session, including its coordinated token refresh. */
export const getDataAppSession =
  (store: SdkStore) => async (config: MetabaseAuthConfig) => {
    if (config.isGuest || config.apiKey) {
      throw new Error("Data app embeds require SSO authentication.");
    }

    const session = await PLUGIN_EMBEDDING_SDK_AUTH.getOrRefreshSession(
      config,
      store,
    );

    if (!session) {
      throw new Error("Unable to authenticate this data app.");
    }

    return session;
  };
