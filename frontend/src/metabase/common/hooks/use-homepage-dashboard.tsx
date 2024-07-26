import { useDashboardQuery } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getCustomHomePageDashboardId } from "metabase/selectors/app";
import { getSettingsLoading } from "metabase/selectors/settings";
import type { DashboardId } from "metabase-types/api";

export const useHomepageDashboard = () => {
  const dashboardId = useSelector(getCustomHomePageDashboardId);
  const isLoadingSettings = useSelector(getSettingsLoading);

  const { data: dashboard, isLoading: isLoadingDashboard } = useDashboardQuery({
    enabled: dashboardId !== null,
    id: dashboardId as DashboardId,
  });

  return {
    dashboardId,
    dashboard,
    isLoading: isLoadingDashboard || isLoadingSettings,
  };
};
