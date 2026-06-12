import type { OnBeforeRequestHandlerConfig } from "metabase/api/client";
import type { CardId, DashboardId, ParameterId } from "metabase-types/api";

const getDefaultPluginApi = () => ({
  onBeforeRequestHandlers: {
    overrideRequestsForPublicEmbeds: async (
      _data: OnBeforeRequestHandlerConfig,
    ): Promise<OnBeforeRequestHandlerConfig | void> => {},
    overrideRequestsForStaticEmbeds: async (
      _data: OnBeforeRequestHandlerConfig,
    ): Promise<OnBeforeRequestHandlerConfig | void> => {},
  },
  getRemappedCardParameterValueUrl: (
    cardId: CardId | string | undefined,
    parameterId: ParameterId,
  ) =>
    `/api/card/${cardId}/params/${encodeURIComponent(parameterId)}/remapping`,
  getRemappedDashboardParameterValueUrl: (
    dashboardId: DashboardId | undefined,
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
