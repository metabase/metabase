import type { CardId, DashboardId, ParameterId } from "metabase-types/api";

export type OnBeforeRequestHandlerData = {
  method: "GET" | "POST";
  url: string;
  options: {
    headers?: Record<string, string>;
    hasBody: boolean;
  } & Record<string, unknown>;
};

export type OnBeforeRequestHandler = (
  data: OnBeforeRequestHandlerData,
) => Promise<void | OnBeforeRequestHandlerData>;

const getDefaultPluginApi = () => ({
  onBeforeRequestHandlers: {
    overrideRequestsForPublicEmbeds: async (
      _data: OnBeforeRequestHandlerData,
    ): Promise<OnBeforeRequestHandlerData | void> => {},
    overrideRequestsForStaticEmbeds: async (
      _data: OnBeforeRequestHandlerData,
    ): Promise<OnBeforeRequestHandlerData | void> => {},
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
