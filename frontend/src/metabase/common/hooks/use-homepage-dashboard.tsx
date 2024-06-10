import { useLocation } from "react-use";

import { useDashboardQuery } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getCustomHomePageDashboardId } from "metabase/selectors/app";
import { getSettingsLoading } from "metabase/selectors/settings";
import type { DashboardId } from "metabase-types/api";

import { useSetting } from "./use-setting";

export const useHomepageDashboard = () => {
  const dashboardId = useSelector(getCustomHomePageDashboardId);
  const isLoadingSettings = useSelector(getSettingsLoading);
  const siteUrl = useSetting("site-url");
  const location = useLocation();

  const { data: dashboard, isLoading: isLoadingDashboard } = useDashboardQuery({
    enabled: dashboardId !== null,
    id: dashboardId as DashboardId,
  });

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
