import { useMount } from "react-use";

import {
  overrideRequestsForPublicOrStaticEmbeds,
  setupEmbedPreviewRewrite,
} from "metabase/embedding/lib/override-requests-for-embeds";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import type { EntityToken, EntityUuid } from "metabase-types/api/entity";

export const usePublicEndpoints = ({
  uuid,
  token,
}: {
  uuid: EntityUuid;
  token: EntityToken;
}) => {
  // Register synchronously during render rather than from the `useMount` below:
  // the dashboard fetcher lives in a child whose effect fires before this
  // parent's effects, so a `useMount` registration would miss the first embed
  // request. The call is idempotent.
  setupEmbedPreviewRewrite();

  useMount(() => {
    if (uuid) {
      overrideRequestsForPublicOrStaticEmbeds("public");
    } else if (token) {
      PLUGIN_CONTENT_TRANSLATION.setEndpointsForStaticEmbedding(token);
      overrideRequestsForPublicOrStaticEmbeds("static");
    }
  });
};
