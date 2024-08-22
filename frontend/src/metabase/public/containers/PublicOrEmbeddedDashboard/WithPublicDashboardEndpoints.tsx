import { type ComponentType, useEffect } from "react";
import type { WithRouterProps } from "react-router";

import {
  setEmbedDashboardEndpoints,
  setPublicDashboardEndpoints,
} from "metabase/services";
import type { DashboardId } from "metabase-types/api";

/** @deprecated - prefer `usePublicDashboardEndpoints`*/
export const WithPublicDashboardEndpoints = <T extends WithRouterProps>(
  Component: ComponentType<T>,
): ComponentType<T & { dashboardId: DashboardId }> => {
  function DashboardEndpointsInner(props: WithRouterProps) {
    const { dashboardId } = usePublicDashboardEndpoints(props);
    return <Component {...(props as T)} dashboardId={dashboardId} />;
  }

  return DashboardEndpointsInner;
};

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
