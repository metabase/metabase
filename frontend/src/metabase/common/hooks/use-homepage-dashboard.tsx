import { useLocation } from "react-use";

import { skipToken, useGetDashboardQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { getCustomHomePageDashboardId } from "metabase/selectors/app";
import { getSettingsLoading } from "metabase/selectors/settings";

import { useSetting } from "./use-setting";

export const useHomepageDashboard = () => {
  const dashboardId = useSelector(getCustomHomePageDashboardId);
  const isLoadingSettings = useSelector(getSettingsLoading);
  const siteUrl = useSetting("site-url");
  const location = useLocation();

  const { data: dashboard, isLoading: isLoadingDashboard } =
    useGetDashboardQuery(dashboardId ? { id: dashboardId } : skipToken);

  const pathname = location?.href?.replace(siteUrl, "");

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
