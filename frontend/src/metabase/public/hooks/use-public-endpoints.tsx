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
  const isPublic = Boolean(uuid);
  const isEmbed = Boolean(token);

  // Register synchronously during render rather than from the `useMount` below:
  // the dashboard fetcher lives in a child whose effect fires before this
  // parent's effects, so a `useMount` registration would miss the first embed
  // request. Order matters — the embed override must be registered before the
  // preview rewrite so it runs first. Both registrations are idempotent.
  if (isPublic) {
    overrideRequestsForPublicOrStaticEmbeds("public");
  } else if (isEmbed) {
    overrideRequestsForPublicOrStaticEmbeds("static");
    setupEmbedPreviewRewrite();
  }

  useMount(() => {
    if (!isPublic && token) {
      PLUGIN_CONTENT_TRANSLATION.setEndpointsForStaticEmbedding(token);
    }
  });
};
