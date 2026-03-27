import { skipToken, useGetDashboardQuery } from "metabase/api";
import { getCustomHomePageDashboardId } from "metabase/selectors/app";
import { getSettingsLoading } from "metabase/selectors/settings";
import { useSelector } from "metabase/utils/redux";

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
