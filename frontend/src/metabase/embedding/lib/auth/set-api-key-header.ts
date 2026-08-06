import type { OnBeforeRequestHandler } from "metabase/api/client";

/**
 * Factories for the embedding-only request-header plugin handlers. Each closes
 * over its value, so there's no shared mutable state — the embedding setup flow
 * installs the handlers it needs onto the plugin slots:
 *
 *  - `setApiKeyHeader` onto `setEmbeddingRequestAuthHeaders` for static auth
 *    (an API key; the MCP Apps entry point installs its own inline handler for
 *    the purpose-bound MCP UI credential). A refreshing SSO session instead
 *    emits its header from `getOrRefreshSessionHandler` via
 *    `getSessionTokenHeaders`, so the refreshed token applies to the request
 *    that triggered the refresh.
 *  - `setRequestClientHeaders` onto its own slot
 *  - `setEmbedPreviewHeader` onto its own slot (public + SDK flows only)
 *
 * In the normal app none are installed, so no embedding headers are emitted —
 * keeping these embedding concerns out of the generic api client.
 */
export const setApiKeyHeader =
  (apiKey: string): OnBeforeRequestHandler =>
  async () => ({ headers: { "X-Api-Key": apiKey } });
