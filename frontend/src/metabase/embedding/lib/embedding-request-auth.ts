/* eslint-disable metabase/no-literal-metabase-strings -- request header names */
import type {
  OnBeforeRequestHandler,
  OnBeforeRequestHandlerConfig,
  RequestClientInfo,
} from "metabase/api/client";
import { IFRAMED_IN_SELF } from "metabase/utils/iframe";

/**
 * Factories for the embedding-only request-header plugin handlers. Each closes
 * over its value, so there's no shared mutable state — the embedding setup flow
 * installs the handlers it needs onto the plugin slots:
 *
 *  - `setApiKeyHeader` / `setSessionTokenHeader` onto `setEmbeddingRequestAuthHeaders`
 *    for static auth (an API key, or a session token that never refreshes — e.g.
 *    MCP). A refreshing SSO session instead emits its header from
 *    `getOrRefreshSessionHandler` via `sessionTokenHeaders`, so the refreshed
 *    token applies to the request that triggered the refresh.
 *  - `setRequestClientHeaders` onto its own slot
 *  - `setEmbedPreviewHeader` onto its own slot (public + SDK flows only)
 *
 * In the normal app none are installed, so no embedding headers are emitted —
 * keeping these embedding concerns out of the generic api client.
 */
export const setApiKeyHeader =
  (apiKey: string): OnBeforeRequestHandler =>
  async () => ({ headers: { "X-Api-Key": apiKey } });

export const sessionTokenHeaders = (
  sessionToken: string,
): Partial<OnBeforeRequestHandlerConfig> => ({
  headers: { "X-Metabase-Session": sessionToken },
});

export const setSessionTokenHeader =
  (sessionToken: string): OnBeforeRequestHandler =>
  async () =>
    sessionTokenHeaders(sessionToken);

export const setRequestClientHeaders =
  (requestClient: RequestClientInfo): OnBeforeRequestHandler =>
  async () => {
    const headers: Record<string, string> = {};

    if (requestClient.name) {
      headers["X-Metabase-Client"] = requestClient.name;
    }
    if (requestClient.version) {
      headers["X-Metabase-Client-Version"] = requestClient.version;
    }

    return { headers };
  };

/**
 * Tag requests coming from an embed preview (the page is iframed into itself).
 * Kept separate from `setRequestClientHeaders` because preview mode is
 * orthogonal to which client is embedding. Installed only by the public and SDK
 * embed flows — static and full-app deliberately don't tag preview requests
 * (see EMB-930 in `metabase/embedding/config`).
 */
export const setEmbedPreviewHeader: OnBeforeRequestHandler = async () => {
  if (IFRAMED_IN_SELF) {
    return { headers: { "X-Metabase-Embedded-Preview": "true" } };
  }
};
