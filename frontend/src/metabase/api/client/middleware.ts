import {
  type OnBeforeRequestHandler,
  type OnBeforeRequestHandlerConfig,
  PLUGIN_API,
  embeddingIframeSdkRequestHooks,
  embeddingSdkRequestHooks,
} from "./request-hooks";

export type {
  OnBeforeRequestHandler,
  OnBeforeRequestHandlerConfig,
} from "./request-hooks";

/**
 * The complete, ordered request-manipulation pipeline.
 *
 * Every handler is a plugin slot — a no-op by default, populated by the owning
 * feature's init flow (SDK auth, guest/public/static embeds, the embed-referrer
 * handlers). Listing them here, rather than letting features push handlers onto
 * a dynamic array, keeps the full set of things that can rewrite an outgoing
 * request — and the order they run in — visible in one place.
 *
 * Order matters: handlers run in sequence and each one sees the result of the
 * previous one. In particular the embed-preview rewrite must run after the
 * embed overrides, which produce the `/api/embed/...` urls it rewrites.
 */
function getOnBeforeRequestHandlers(): OnBeforeRequestHandler[] {
  return [
    PLUGIN_API.onBeforeRequestHandlers.setRequestClientHeaders,
    PLUGIN_API.onBeforeRequestHandlers.setEmbedPreviewHeader,
    PLUGIN_API.onBeforeRequestHandlers.setEmbeddingRequestAuthHeaders,
    PLUGIN_API.onBeforeRequestHandlers.setEmbeddedHeader,
    embeddingSdkRequestHooks.getOrRefreshSessionHandler,
    embeddingSdkRequestHooks.getOrRefreshGuestSessionHandler,
    embeddingSdkRequestHooks.overrideRequestsForGuestEmbeds,
    PLUGIN_API.onBeforeRequestHandlers.overrideRequestsForPublicEmbeds,
    PLUGIN_API.onBeforeRequestHandlers.rewriteEmbedPreviewUrl,
    embeddingSdkRequestHooks.reactSdkEmbedReferrer,
    embeddingIframeSdkRequestHooks.embedReferrer,
  ];
}

export async function apiRequestManipulationMiddleware(
  requestConfig: OnBeforeRequestHandlerConfig,
): Promise<OnBeforeRequestHandlerConfig> {
  return runBeforeRequestHandlers(getOnBeforeRequestHandlers(), requestConfig);
}

/**
 * Run a list of handlers over the request config, in order, merging each
 * handler's partial result into the running config. Exported so the
 * merge/ordering semantics can be unit-tested with an explicit handler list.
 */
export async function runBeforeRequestHandlers(
  handlers: OnBeforeRequestHandler[],
  requestConfig: OnBeforeRequestHandlerConfig,
): Promise<OnBeforeRequestHandlerConfig> {
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
