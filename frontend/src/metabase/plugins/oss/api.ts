import type { CardId, DashboardId, ParameterId } from "metabase-types/api";

const getDefaultPluginApi = () => ({
  getRemappedCardParameterValueUrl: (
    cardId: CardId | string,
    parameterId: ParameterId,
  ) =>
    `/api/card/${cardId}/params/${encodeURIComponent(parameterId)}/remapping`,
  getRemappedDashboardParameterValueUrl: (
    dashboardId: DashboardId,
    parameterId: ParameterId,
  ) =>
    `/api/dashboard/${dashboardId}/params/${encodeURIComponent(parameterId)}/remapping`,
});

export const PLUGIN_API = getDefaultPluginApi();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_API, getDefaultPluginApi());
}
