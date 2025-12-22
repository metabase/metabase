import type { WithRouterProps } from "react-router";
import { useMount } from "react-use";

import {
  overrideRequestsForPublicEmbeds,
  overrideRequestsForStaticEmbeds,
} from "metabase/embedding/lib/override-requests-for-embeds";

export const usePublicDashboardEndpoints = (props: WithRouterProps) => {
  const { uuid, token } = props.params;

  useMount(() => {
    if (uuid) {
      overrideRequestsForPublicEmbeds("dashboard");
    } else if (token) {
      overrideRequestsForStaticEmbeds("dashboard");
    }
  });

  const dashboardId = uuid || token;

  return { dashboardId };
};
