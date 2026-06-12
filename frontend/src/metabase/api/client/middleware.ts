import { PLUGIN_API, PLUGIN_EMBEDDING_SDK } from "metabase/plugins";

import type { RequestMethod } from "./method";

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

export async function apiRequestManipulationMiddleware(
  beforeRequestHandlers: OnBeforeRequestHandler[],
  requestConfig: OnBeforeRequestHandlerConfig,
): Promise<OnBeforeRequestHandlerConfig> {
  // Handlers order is important.
  // Handlers are executed in order and each handler uses the data returned by a previous handler.
  const handlers = [
    PLUGIN_EMBEDDING_SDK.onBeforeRequestHandlers.getOrRefreshSessionHandler,
    PLUGIN_EMBEDDING_SDK.onBeforeRequestHandlers
      .getOrRefreshGuestSessionHandler,
    PLUGIN_EMBEDDING_SDK.onBeforeRequestHandlers.overrideRequestsForGuestEmbeds,
    PLUGIN_API.onBeforeRequestHandlers.overrideRequestsForPublicEmbeds,
    PLUGIN_API.onBeforeRequestHandlers.overrideRequestsForStaticEmbeds,
    ...beforeRequestHandlers,
  ];

  let result = requestConfig;
  for (const handler of handlers) {
    const next = await handler(result);
    if (next) {
      result = merge(result, next);
    }
  }

  return result;
}

function merge(
  prev: OnBeforeRequestHandlerConfig,
  next: Partial<OnBeforeRequestHandlerConfig>,
) {
  const result = { ...prev };

  if (next?.method) {
    result.method = next.method;
  }
  if (next?.url) {
    result.url = next.url;
  }
  if (next?.headers) {
    result.headers = {
      ...(result.headers ?? {}),
      ...next.headers,
    };
  }
  if (next?.data) {
    result.data = {
      ...result.data,
      ...next.data,
    };
  }
  if (next?.body) {
    result.body = {
      ...(result.body ?? {}),
      ...next.body,
    };
  }

  return result;
}
