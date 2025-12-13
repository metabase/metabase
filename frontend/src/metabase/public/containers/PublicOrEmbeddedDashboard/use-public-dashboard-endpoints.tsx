import { useEffect } from "react";
import type { Params } from "react-router/lib/Router";

import {
  setEmbedDashboardEndpoints,
  setPublicDashboardEndpoints,
} from "metabase/services";

export const usePublicDashboardEndpoints = (params: Params) => {
  const { uuid, token } = params;

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
