import type { Query } from "history";
import { useCallback } from "react";

import {
  fetchDashboard,
  fetchDashboardCardData,
} from "metabase/dashboard/actions";
import { useDispatch } from "metabase/lib/redux";
import type { DashboardId } from "metabase-types/api";

interface UseRefreshDashboardProps {
  dashboardId: DashboardId | null;
  parameterQueryParams: Query;
}

export const useRefreshDashboard = ({
  dashboardId,
  parameterQueryParams,
}: UseRefreshDashboardProps): {
  refreshDashboard: () => Promise<void>;
  refreshDashboardCardData: () => Promise<void>;
} => {
  const dispatch = useDispatch();

  const refreshDashboard = useCallback(async () => {
    if (!dashboardId) {
      return;
    }

    await dispatch(
      fetchDashboard({
        dashId: dashboardId,
        queryParams: parameterQueryParams,
        options: { preserveParameters: true },
      }),
    );
  }, [dashboardId, dispatch, parameterQueryParams]);

  const refreshDashboardCardData = useCallback(async () => {
    if (!dashboardId) {
      return;
    }

    await dispatch(
      fetchDashboardCardData({
        isRefreshing: true,
        reload: true,
        clearCache: false,
      }),
    );
  }, [dashboardId, dispatch]);

  return { refreshDashboard, refreshDashboardCardData };
};
