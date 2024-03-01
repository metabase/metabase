import { getDashboardParametersByDashboardId } from "metabase/dashboard/selectors";
import type { DashboardId } from "metabase-types/api";
import { useSelector } from "metabase/lib/redux";

export const useDashboardParameters = (dashboardId: DashboardId) => {
  return useSelector(state => getDashboardParametersByDashboardId(state, dashboardId));
};
