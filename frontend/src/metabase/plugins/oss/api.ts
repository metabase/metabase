import type { DashboardId, ParameterId } from "metabase-types/api";

export const PLUGIN_API = {
  getRemappedCardParameterValueUrl: (
    dashboardId: DashboardId,
    parameterId: ParameterId,
  ) =>
    `/api/card/${dashboardId}/params/${encodeURIComponent(parameterId)}/remapping`,
  getRemappedDashboardParameterValueUrl: (
    dashboardId: DashboardId,
    parameterId: ParameterId,
  ) =>
    `/api/dashboard/${dashboardId}/params/${encodeURIComponent(parameterId)}/remapping`,
};
