import type { WithRouterProps } from "react-router";
import { useMount } from "react-use";

import { overrideRequestsForPublicOrStaticEmbeds } from "metabase/embedding/lib/override-requests-for-embeds";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";

export const usePublicDashboardEndpoints = (props: WithRouterProps) => {
  const { uuid, token } = props.params;

  useMount(() => {
    if (uuid) {
      overrideRequestsForPublicOrStaticEmbeds("public");
    } else if (token) {
      PLUGIN_CONTENT_TRANSLATION.setEndpointsForStaticEmbedding(token);
      overrideRequestsForPublicOrStaticEmbeds("static");
    }
  });

  const dashboardId = uuid || token;

  return { dashboardId };
};
