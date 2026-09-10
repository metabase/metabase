import { definePluginSlot } from "metabase/plugins/slot";

import { noop, setEmbeddedHeader } from "./client/request-handlers";

/**
 * The api client's request-extension slots.
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
    // Emit the embedding auth header (`X-Api-Key`, `X-Metabase-Session`, or
    // `X-Metabase-Mcp-Ui-Auth`). A no-op slot: the embedding auth flow installs
    // exactly one strategy here based on the auth method in use (see
    // `embedding-request-auth` and the MCP Apps entry point).
    setEmbeddingRequestAuthHeaders: noop,
    // Resolve and emit the SDK session token, refreshing it when expired.
    // Installed by SDK auth (`embedding-sdk-ee/auth`).
    getOrRefreshSessionHandler: noop,
    // Swap a stale guest-embed token in the request for a freshly refreshed
    // one. Installed by the guest-embed init flow.
    getOrRefreshGuestSessionHandler: noop,
    // Rewrite requests to their guest-embed equivalents. Installed by the
    // guest-embed init flow.
    overrideRequestsForGuestEmbeds: noop,
    // Send the host page URL as the embed referrer header. Installed by the
    // React SDK's init flow.
    reactSdkEmbedReferrer: noop,
    // Send the host page URL as the embed referrer header. Installed by the
    // iframe SDK's embed route, which receives the URL via postMessage.
    embedReferrer: noop,
  },
});

export const PLUGIN_API = definePluginSlot(getDefaultPluginApi);
