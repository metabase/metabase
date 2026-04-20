import { merge } from "icepick";

import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types/auth-config";
import { overrideRequestsForGuestEmbeds } from "metabase/embedding/lib/override-requests-for-embeds";
import { PLUGIN_EMBEDDING_SDK } from "metabase/plugins";
import type { OnBeforeRequestHandlerConfig } from "metabase/plugins/oss/api";
import { refreshSiteSettings } from "metabase/redux/settings";
import { isJWT } from "metabase/utils/jwt";
import { createAsyncThunk } from "metabase/utils/redux";

import { getOrRefreshGuestSession } from "./auth";

export const initGuestEmbed = createAsyncThunk<void, MetabaseAuthConfig>(
  "sdk/token/INIT_GUEST_EMBED",
  async (authConfig: MetabaseAuthConfig, { dispatch }) => {
    overrideRequestsForGuestEmbeds();

    if (authConfig.isGuest && authConfig.guestEmbedProviderUri) {
      // Replaces the request token with the newly refreshed guest embed token.
      PLUGIN_EMBEDDING_SDK.onBeforeRequestHandlers.getOrRefreshGuestSessionHandler =
        async (config: OnBeforeRequestHandlerConfig) => {
          const newToken = await dispatch(
            getOrRefreshGuestSession(authConfig),
          ).unwrap();

          // The URL is templated (e.g. /api/embed/card/:entityIdentifier/params/:paramId/values or /api/embed/card/:token/query)
          if (newToken && "entityIdentifier" in config.data) {
            return merge(config, {
              data: {
                entityIdentifier: newToken,
              },
            });
          }

          if (newToken && "token" in config.data) {
            return merge(config, {
              data: {
                token: newToken,
              },
            });
          }

          // The token value is inlined in the URL path (e.g. /api/embed/card/{jwt}/query).
          // Replace it with :entityIdentifier so the parameter substitution in api.js
          // can bake the refreshed token into the URL.
          if (newToken) {
            const jwtInUrl = config.url
              .split("/")
              .find((segment) => isJWT(segment));

            if (jwtInUrl) {
              return merge(config, {
                url: config.url.replace(jwtInUrl, ":entityIdentifier"),
                data: { entityIdentifier: newToken },
              });
            }
          }
        };
    }

    await dispatch(refreshSiteSettings());
  },
);
