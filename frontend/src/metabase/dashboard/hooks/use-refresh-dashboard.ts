import type { Query } from "history";
import { useCallback } from "react";

import {
  fetchDashboard,
  fetchDashboardCardData,
} from "metabase/dashboard/actions";
import { useDispatch } from "metabase/lib/redux";
import type { DashboardId } from "metabase-types/api";

export const useRefreshDashboard = ({
  dashboardId,
  parameterQueryParams,
  refetchData = true,
}: {
  dashboardId: DashboardId | null;
  parameterQueryParams: Record<string, unknown>;
  refetchData?: boolean;
}): {
  refreshDashboard: () => Promise<void>;
} => {
  const dispatch = useDispatch();

  const refreshDashboard = useCallback(async () => {
    if (dashboardId) {
      await dispatch(
        fetchDashboard({
          dashId: dashboardId,
          queryParams: parameterQueryParams as Query,
          options: { preserveParameters: true },
        }),
      );
      if (refetchData) {
        dispatch(
          fetchDashboardCardData({
            isRefreshing: true,
            reload: true,
            clearCache: false,
          }),
        );
      }
    }
  }, [dashboardId, dispatch, parameterQueryParams, refetchData]);

  return { refreshDashboard };
};
