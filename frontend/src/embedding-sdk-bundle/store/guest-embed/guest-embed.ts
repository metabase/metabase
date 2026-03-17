import { merge } from "icepick";

import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types/auth-config";
import { overrideRequestsForGuestEmbeds } from "metabase/embedding/lib/override-requests-for-embeds";
import { createAsyncThunk } from "metabase/lib/redux";
import { PLUGIN_EMBEDDING_SDK } from "metabase/plugins";
import type { OnBeforeRequestHandlerConfig } from "metabase/plugins/oss/api";
import { refreshSiteSettings } from "metabase/redux/settings";

import { getOrRefreshGuestSession } from "./guest-embed-auth";

export const initGuestEmbed = createAsyncThunk<void, MetabaseAuthConfig>(
  "sdk/token/INIT_GUEST_EMBED",
  async (authConfig: MetabaseAuthConfig, { dispatch }) => {
    // Register request override for URL transformation
    overrideRequestsForGuestEmbeds();

    // Check `isGuest` to narrow the type.
    if (authConfig.isGuest && authConfig.guestEmbedProviderUri) {
      PLUGIN_EMBEDDING_SDK.onBeforeRequestHandlers.getOrRefreshGuestSessionHandler =
        async (config: OnBeforeRequestHandlerConfig) => {
          const newToken = await dispatch(
            getOrRefreshGuestSession(authConfig),
          ).unwrap();

          if (newToken && "entityIdentifier" in config.data) {
            return merge(config, {
              data: {
                entityIdentifier: newToken,
              },
            });
          }
        };
    }

    await dispatch(refreshSiteSettings());
  },
);
