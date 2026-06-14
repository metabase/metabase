/* eslint-disable metabase/no-literal-metabase-strings -- request header names */
import type {
  OnBeforeRequestHandlerConfig,
  RequestClientInfo,
} from "metabase/api/client";
import { IFRAMED_IN_SELF } from "metabase/utils/iframe";

type EmbeddingRequestHandler =
  () => Promise<Partial<OnBeforeRequestHandlerConfig> | void>;

/**
 * Factories for the embedding-only request-header plugin handlers. Each closes
 * over its value, so there's no shared mutable state — the embedding setup flow
 * installs the handlers it needs onto the plugin slots:
 *
 *  - `setApiKeyHeader` / `setSessionTokenHeader` onto `setEmbeddingRequestAuthHeaders`
 *    (whichever auth method is in use; the session strategy is re-installed on
 *    refresh with the new token)
 *  - `setRequestClientHeaders` onto its own slot
 *  - `setEmbedPreviewHeader` onto its own slot (public + SDK flows only)
 *
 * In the normal app none are installed, so no embedding headers are emitted —
 * keeping these embedding concerns out of the generic api client.
 */
export const setApiKeyHeader =
  (apiKey: string): EmbeddingRequestHandler =>
  async () => ({ headers: { "X-Api-Key": apiKey } });

export const setSessionTokenHeader =
  (sessionToken: string): EmbeddingRequestHandler =>
  async () => ({ headers: { "X-Metabase-Session": sessionToken } });

export const setRequestClientHeaders =
  (requestClient: RequestClientInfo): EmbeddingRequestHandler =>
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
export const setEmbedPreviewHeader: EmbeddingRequestHandler = async () => {
  if (IFRAMED_IN_SELF) {
    return { headers: { "X-Metabase-Embedded-Preview": "true" } };
  }
};
