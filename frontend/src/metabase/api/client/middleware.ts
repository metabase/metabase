import { PLUGIN_API, PLUGIN_EMBEDDING_SDK } from "metabase/plugins";
import type {
  OnBeforeRequestHandler,
  OnBeforeRequestHandlerConfig,
} from "metabase/plugins/oss/api";

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
