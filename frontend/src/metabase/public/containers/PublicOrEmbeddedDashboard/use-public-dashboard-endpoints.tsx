import type { WithRouterProps } from "react-router";
import { useMount } from "react-use";

import { overrideRequestsForGuestOrPublicEmbeds } from "embedding-sdk-bundle/lib/override-requests-for-guest-or-public-embeds";

export const usePublicDashboardEndpoints = (props: WithRouterProps) => {
  const { uuid, token } = props.params;

  useMount(() => {
    overrideRequestsForGuestOrPublicEmbeds(uuid ? "public" : "static");
  });

  const dashboardId = uuid || token;

  return { dashboardId };
};
