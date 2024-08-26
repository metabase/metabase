import { skipToken, useGetDashboardQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { getCustomHomePageDashboardId } from "metabase/selectors/app";
import { getSettingsLoading } from "metabase/selectors/settings";

export const useHomepageDashboard = () => {
  const dashboardId = useSelector(getCustomHomePageDashboardId);
  const isLoadingSettings = useSelector(getSettingsLoading);

  const { data: dashboard, isLoading: isLoadingDashboard } =
    useGetDashboardQuery(dashboardId ? { id: dashboardId } : skipToken);

  return {
    dashboardId,
    dashboard,
    isLoading: isLoadingDashboard || isLoadingSettings,
  };
};
