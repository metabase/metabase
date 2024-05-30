import { useCallback } from "react";

import {
  fetchDashboard,
  fetchDashboardCardData,
  fetchDashboardCardMetadata,
} from "metabase/dashboard/actions";
import { useDispatch } from "metabase/lib/redux";
import type { DashboardId } from "metabase-types/api";

export const useRefreshDashboard = ({
  dashboardId,
  parameterQueryParams,
}: {
  dashboardId: DashboardId;
  parameterQueryParams: Record<string, unknown>;
}): {
  refreshDashboard: () => Promise<void>;
} => {
  const dispatch = useDispatch();

  const refreshDashboard = useCallback(async () => {
    if (dashboardId) {
      await dispatch(
        fetchDashboard({
          dashId: dashboardId,
          queryParams: parameterQueryParams,
          options: { preserveParameters: true },
        }),
      );
      dispatch(fetchDashboardCardMetadata());
      dispatch(
        fetchDashboardCardData({
          isRefreshing: true,
          reload: true,
          clearCache: false,
        }),
      );
    }
  }, [dashboardId, dispatch, parameterQueryParams]);

  return { refreshDashboard };
};
