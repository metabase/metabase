// Import the plugin objects from their leaf modules, not the `metabase/plugins`
// barrel: the barrel pulls in the whole plugin graph (and, through it, modules
// that import `metabase/api`) while the api client is still initializing —
// a circular import. The leaves export the same live objects that EE code
// mutates, so nothing behavioral changes.
import { PLUGIN_API } from "metabase/plugins/oss/api";
import { PLUGIN_EMBEDDING_IFRAME_SDK } from "metabase/plugins/oss/embedding-iframe-sdk";
import { PLUGIN_EMBEDDING_SDK } from "metabase/plugins/oss/embedding-sdk";

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
    PLUGIN_EMBEDDING_SDK.onBeforeRequestHandlers.getOrRefreshSessionHandler,
    PLUGIN_EMBEDDING_SDK.onBeforeRequestHandlers
      .getOrRefreshGuestSessionHandler,
    PLUGIN_EMBEDDING_SDK.onBeforeRequestHandlers.overrideRequestsForGuestEmbeds,
    PLUGIN_API.onBeforeRequestHandlers.overrideRequestsForPublicEmbeds,
    PLUGIN_API.onBeforeRequestHandlers.rewriteEmbedPreviewUrl,
    PLUGIN_EMBEDDING_SDK.onBeforeRequestHandlers.reactSdkEmbedReferrer,
    PLUGIN_EMBEDDING_IFRAME_SDK.onBeforeRequestHandlers.embedReferrer,
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
