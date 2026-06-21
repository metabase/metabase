import type { RequestMethod } from "metabase/api/client";
import type { CardId, DashboardId, ParameterId } from "metabase-types/api";

export type OnBeforeRequestHandlerConfig = {
  method: RequestMethod;
  url: string;
  headers?: Record<string, string>;
  // URL `:tag` params (and querystring leftovers). For the legacy GET/POST
  // helpers this holds the whole request bag.
  data: Record<string, unknown>;
  // The JSON-body bag, kept as a separate channel from `data`. Exposed to
  // handlers so embed URL `:tag`s — notably the guest-embed `:token` — can be
  // filled from body fields, and so the refresh handler can swap a stale body
  // token. `undefined` for GETs, raw (FormData/URLSearchParams) bodies, and the
  // legacy helpers (which pack everything into `data`).
  body?: Record<string, unknown>;
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
