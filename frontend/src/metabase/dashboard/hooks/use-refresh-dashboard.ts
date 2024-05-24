import {
  fetchDashboard,
  fetchDashboardCardData,
} from "metabase/dashboard/actions";
import { useDispatch } from "metabase/lib/redux";
import type { DashboardId } from "metabase-types/api";

export const useRefreshDashboard = ({
  dashboardId,
  queryParams,
}: {
  dashboardId: DashboardId;
  queryParams: Record<string, unknown>;
}): {
  refreshDashboard: () => Promise<void>;
} => {
  const dispatch = useDispatch();

  const refreshDashboard = async () => {
    if (dashboardId) {
      await dispatch(
        fetchDashboard({
          dashId: dashboardId,
          queryParams: queryParams,
          options: { preserveParameters: true },
        }),
      );
      dispatch(
        fetchDashboardCardData({
          isRefreshing: true,
          reload: true,
          clearCache: false,
        }),
      );
    }
  };

  return { refreshDashboard };
};
