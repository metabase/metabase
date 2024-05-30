import type { ComponentType } from "react";
import type { WithRouterProps } from "react-router";

import {
  setEmbedDashboardEndpoints,
  setPublicDashboardEndpoints,
} from "metabase/services";
import type { DashboardId } from "metabase-types/api";

export const WithPublicDashboardEndpoints = <T extends WithRouterProps>(
  Component: ComponentType<T>,
): ComponentType<T & { dashboardId: DashboardId }> => {
  function DashboardEndpointsInner({
    params: { uuid, token },
    ...props
  }: {
    params: {
      uuid?: string;
      token?: string;
    };
  }) {
    if (uuid) {
      setPublicDashboardEndpoints();
    } else if (token) {
      setEmbedDashboardEndpoints();
    }
    const dashboardId = uuid || token;
    return <Component {...(props as T)} dashboardId={dashboardId} />;
  }

  return DashboardEndpointsInner;
};
