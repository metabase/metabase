/* eslint-disable metabase/no-literal-metabase-strings -- request header names */
import type { OnBeforeRequestHandler } from "metabase/api/client";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { isWithinIframe } from "metabase/utils/iframe";

const noop: OnBeforeRequestHandler = async () => {};

// Tag requests from a non-SDK app running inside an iframe (interactive /
// static / public embedding) so the backend knows it's embedded. Lives here
// rather than in `metabase/api` so the client stays free of SDK imports.
const setEmbeddedHeader: OnBeforeRequestHandler = async () => {
  if (isWithinIframe() && !isEmbeddingSdk()) {
    return { headers: { "X-Metabase-Embedded": "true" } };
  }
};

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

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_API, getDefaultPluginApi());
}
