/* eslint-disable metabase/no-literal-metabase-strings -- request header names */
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { isWithinIframe } from "metabase/utils/iframe";

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

const noop: OnBeforeRequestHandler = async () => {};

// Tag requests from a non-SDK app running inside an iframe (interactive /
// static / public embedding) so the backend knows it's embedded.
const setEmbeddedHeader: OnBeforeRequestHandler = async () => {
  if (isWithinIframe() && !isEmbeddingSdk()) {
    return { headers: { "X-Metabase-Embedded": "true" } };
  }
};

/**
 * The api client's request-extension slots.
 *
 * These objects are owned by the api client (which composes them, in a fixed
 * order, in `middleware.ts`) rather than by `metabase/plugins`, so that the
 * client never has to import the plugin graph — the plugin graph reaches into
 * app modules that themselves import `metabase/api`, which would be a circular
 * import. Feature code (embedding flows, SDK auth, EE plugins) installs
 * behavior by assigning to the named slots; the aggregate plugin
 * `reinitialize` resets them through the reinitialize functions below.
 */
const getDefaultPluginApi = () => ({
  onBeforeRequestHandlers: {
    overrideRequestsForPublicEmbeds: noop,
    rewriteEmbedPreviewUrl: noop,
    setEmbeddedHeader,
    // Emit the embedding client headers (`X-Metabase-Client` / `-Version`). A
    // no-op slot: the embedding setup flow installs `setRequestClientHeaders`
    // here, closing over the active client (see `embedding-request-auth`).
    // Untouched in the normal app — keeping these embedding-only headers out of
    // the generic api client.
    setRequestClientHeaders: noop,
    // Emit the embed-preview header (`X-Metabase-Embedded-Preview`). A no-op
    // slot: the public and SDK embed flows install `setEmbedPreviewHeader` here,
    // which tags requests when running inside an embed preview (see
    // `embedding-request-auth`).
    setEmbedPreviewHeader: noop,
    // Emit the embedding auth header (`X-Api-Key` or `X-Metabase-Session`). A
    // no-op slot: the embedding auth flow installs exactly one strategy here —
    // `setApiKeyHeader` or `setSessionTokenHeader` — based on the auth method in
    // use (see `embedding-request-auth`).
    setEmbeddingRequestAuthHeaders: noop,
  },
});

export const PLUGIN_API = getDefaultPluginApi();

export function reinitializePluginApi() {
  Object.assign(PLUGIN_API, getDefaultPluginApi());
}

const getDefaultEmbeddingSdkRequestHooks = () => ({
  getOrRefreshSessionHandler: noop,
  getOrRefreshGuestSessionHandler: noop,
  overrideRequestsForGuestEmbeds: noop,
  reactSdkEmbedReferrer: noop,
});

/**
 * `PLUGIN_EMBEDDING_SDK.onBeforeRequestHandlers`, by reference. Reset it with
 * the reinitialize function below (which mutates it in place) — replacing the
 * object would split it from the plugin object.
 */
export const embeddingSdkRequestHooks = getDefaultEmbeddingSdkRequestHooks();

export function reinitializeEmbeddingSdkRequestHooks() {
  Object.assign(embeddingSdkRequestHooks, getDefaultEmbeddingSdkRequestHooks());
}

const getDefaultEmbeddingIframeSdkRequestHooks = () => ({
  embedReferrer: noop,
});

/**
 * `PLUGIN_EMBEDDING_IFRAME_SDK.onBeforeRequestHandlers`, by reference. Reset
 * it with the reinitialize function below (which mutates it in place) —
 * replacing the object would split it from the plugin object.
 */
export const embeddingIframeSdkRequestHooks =
  getDefaultEmbeddingIframeSdkRequestHooks();

export function reinitializeEmbeddingIframeSdkRequestHooks() {
  Object.assign(
    embeddingIframeSdkRequestHooks,
    getDefaultEmbeddingIframeSdkRequestHooks(),
  );
}
