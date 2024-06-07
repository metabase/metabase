import { useLocation } from "react-use";

import { skipToken, useGetDashboardQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { getCustomHomePageDashboardId } from "metabase/selectors/app";
import { getSettingsLoading } from "metabase/selectors/settings";

export const useHomepageDashboard = () => {
  const dashboardId = useSelector(getCustomHomePageDashboardId);
  const isLoadingSettings = useSelector(getSettingsLoading);
  const { pathname } = useLocation();

  const { data: dashboard, isLoading: isLoadingDashboard } =
    useGetDashboardQuery(dashboardId ? { id: dashboardId } : skipToken);

  const isAtHomepageDashboard = Boolean(
    dashboardId && pathname?.startsWith(`/dashboard/${dashboardId}`),
  );

  return {
    dashboardId,
    dashboard,
    isLoading: isLoadingDashboard || isLoadingSettings,
    canNavigateHome: !isAtHomepageDashboard || dashboard?.archived,
  };
};
