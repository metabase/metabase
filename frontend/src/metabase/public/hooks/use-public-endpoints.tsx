import { useMount } from "react-use";

import { overrideRequestsForPublicOrStaticEmbeds } from "metabase/embedding/lib/override-requests-for-embeds";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import type { EntityToken, EntityUuid } from "metabase-types/api/entity";

export const usePublicEndpoints = ({
  uuid,
  token,
}: {
  uuid: EntityUuid;
  token: EntityToken;
}) => {
  useMount(() => {
    if (uuid) {
      overrideRequestsForPublicOrStaticEmbeds("public");
    } else if (token) {
      PLUGIN_CONTENT_TRANSLATION.setEndpointsForStaticEmbedding(token);
      overrideRequestsForPublicOrStaticEmbeds("static");
    }
  });
};
