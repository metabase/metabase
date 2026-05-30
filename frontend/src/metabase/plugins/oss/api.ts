import type { RequestMethod } from "metabase/api/client";
import type { CardId, DashboardId, ParameterId } from "metabase-types/api";

export type OnBeforeRequestHandlerConfig = {
  method: RequestMethod;
  url: string;
  headers?: Record<string, string>;
  data: Record<string, unknown>;
};

export type OnBeforeRequestHandler = (
  data: OnBeforeRequestHandlerConfig,
) => Promise<void | Partial<OnBeforeRequestHandlerConfig>>;

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
