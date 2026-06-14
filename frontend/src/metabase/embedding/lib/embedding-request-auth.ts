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

    if (IFRAMED_IN_SELF) {
      headers["X-Metabase-Embedded-Preview"] = "true";
    }
    if (typeof requestClient === "object") {
      headers["X-Metabase-Client"] = requestClient.name;
      if (requestClient.version) {
        headers["X-Metabase-Client-Version"] = requestClient.version;
      }
    } else {
      headers["X-Metabase-Client"] = requestClient;
    }

    return { headers };
  };
