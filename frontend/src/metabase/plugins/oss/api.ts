import type { OnBeforeRequestHandlerConfig } from "metabase/api/client";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { isWithinIframe } from "metabase/utils/iframe";
import type { CardId, DashboardId, ParameterId } from "metabase-types/api";

const getDefaultPluginApi = () => ({
  onBeforeRequestHandlers: {
    overrideRequestsForPublicEmbeds: async (
      _data: OnBeforeRequestHandlerConfig,
    ): Promise<OnBeforeRequestHandlerConfig | void> => {},
    rewriteEmbedPreviewUrl: async (
      _data: OnBeforeRequestHandlerConfig,
    ): Promise<Partial<OnBeforeRequestHandlerConfig> | void> => {},
    // Tag requests from a non-SDK app running inside an iframe (interactive /
    // static / public embedding) so the backend knows it's embedded. Lives here
    // rather than in `metabase/api` so the client stays free of SDK imports.
    setEmbeddedHeader:
      async (): Promise<Partial<OnBeforeRequestHandlerConfig> | void> => {
        if (isWithinIframe() && !isEmbeddingSdk()) {
          return {
            // eslint-disable-next-line metabase/no-literal-metabase-strings -- header name
            headers: { "X-Metabase-Embedded": "true" },
          };
        }
      },
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
