import { skipToken, useGetDashboardQuery } from "metabase/api";
import { useSelector } from "metabase/redux";
import { getCustomHomePageDashboardId } from "metabase/selectors/app";

export const useHomepageDashboard = () => {
  const dashboardId = useSelector(getCustomHomePageDashboardId);

  const { data: dashboard, isLoading: isLoadingDashboard } =
    useGetDashboardQuery(dashboardId ? { id: dashboardId } : skipToken);

  return {
    dashboardId,
    dashboard,
    isLoading: isLoadingDashboard,
  };
};
