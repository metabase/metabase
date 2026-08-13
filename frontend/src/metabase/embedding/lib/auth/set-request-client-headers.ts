/* eslint-disable metabase/no-literal-metabase-strings -- request header names */
import type {
  OnBeforeRequestHandler,
  RequestClientInfo,
} from "metabase/api/client";

/**
 * This helper sets a client-related headers that help identify a client
 */
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

    if (requestClient.identifier) {
      headers["X-Metabase-Client-Identifier"] = requestClient.identifier;
    }

    return { headers };
  };
