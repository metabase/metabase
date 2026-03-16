import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types/auth-config";
import { overrideRequestsForGuestEmbeds } from "metabase/embedding/lib/override-requests-for-embeds";
import { createAsyncThunk } from "metabase/lib/redux";
import { PLUGIN_EMBEDDING_SDK } from "metabase/plugins";
import type { OnBeforeRequestHandlerData } from "metabase/plugins/oss/api";
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
        async (data: OnBeforeRequestHandlerData) => {
          const newToken = await dispatch(
            getOrRefreshGuestSession(authConfig),
          ).unwrap();

          // Override the token URL-parameters with the current (possibly
          // refreshed) token. This runs *before* api.js substitutes URL
          // placeholders, so the fresh token is used even though rawData was
          // captured at call-time with the old token.
          // Covers both the pre-transform names (:token) and the post-transform
          // name (:entityIdentifier) that overrideRequestsForGuestEmbeds
          // introduces, regardless of which handler runs first.
          if (newToken) {
            return {
              ...data,
              rawDataOverrides: { token: newToken, entityIdentifier: newToken },
            };
          }
        };
    }

    await dispatch(refreshSiteSettings());
  },
);
