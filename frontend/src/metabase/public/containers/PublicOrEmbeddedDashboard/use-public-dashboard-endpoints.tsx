import { useEffect } from "react";
import type { WithRouterProps } from "react-router";

import {
  setEmbedDashboardEndpoints,
  setPublicDashboardEndpoints,
} from "metabase/services";

export const usePublicDashboardEndpoints = (props: WithRouterProps) => {
  const { uuid, token } = props.params;

  useEffect(() => {
    if (uuid) {
      setPublicDashboardEndpoints(uuid);
    } else if (token) {
      setEmbedDashboardEndpoints(token);
    }
  }, [uuid, token]);

  const dashboardId = uuid || token;

  return { dashboardId };
};
