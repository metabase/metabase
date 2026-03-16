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

          // If token was refreshed (not null) and URL contains token parameters,
          // replace them with the new token
          if (newToken) {
            let updatedUrl = data.url;

            // Replace :token or :entityIdentifier with the actual refreshed token
            // This ensures API calls use the refreshed token even if the component
            // data still has the expired token
            if (updatedUrl.includes(":token")) {
              updatedUrl = updatedUrl.replace(
                /:token/g,
                encodeURIComponent(newToken),
              );
            }
            if (updatedUrl.includes(":entityIdentifier")) {
              updatedUrl = updatedUrl.replace(
                /:entityIdentifier/g,
                encodeURIComponent(newToken),
              );
            }

            return {
              ...data,
              url: updatedUrl,
            };
          }
        };
    }

    await dispatch(refreshSiteSettings());
  },
);
