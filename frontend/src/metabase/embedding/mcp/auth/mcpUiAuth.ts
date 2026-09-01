import type { App } from "@modelcontextprotocol/ext-apps/react";

import { PLUGIN_API } from "metabase/plugins";
import { retry } from "metabase/utils/retry";

import {
  MCP_APPS_METADATA_KEY,
  UI_CREDENTIAL_REFRESH_MAX_FAILURES,
  UI_CREDENTIAL_REFRESH_RETRY_MS,
  UI_CREDENTIAL_REFRESH_TIMEOUT_MS,
  UI_CREDENTIAL_REFRESH_TOOL,
  UI_CREDENTIAL_VALIDITY_MS,
} from "../constants";

export interface McpUiAuth {
  credential: string;
  sessionId: string;
}

export function installMcpUiCredential(credential: string) {
  PLUGIN_API.onBeforeRequestHandlers.setEmbeddingRequestAuthHeaders =
    // eslint-disable-next-line metabase/no-literal-metabase-strings -- request header name
    async () => ({ headers: { "X-Metabase-Mcp-Ui-Auth": credential } });
}

export async function refreshMcpUiAuth(
  app: App,
  abortController: AbortController,
) {
  let requestStartedAt = Date.now();

  const auth = await retry(
    () => {
      requestStartedAt = Date.now();

      return requestAuth(app, abortController.signal);
    },
    {
      maxRetries: UI_CREDENTIAL_REFRESH_MAX_FAILURES - 1,
      shouldRetry: (error) => {
        if (abortController.signal.aborted) {
          return false;
        }

        console.error("Error refreshing MCP UI credential:", error);

        return true;
      },
      delayMs: () => UI_CREDENTIAL_REFRESH_RETRY_MS,
      signal: abortController.signal,
    },
  );

  abortController.signal.throwIfAborted();

  return { auth, expiresAt: requestStartedAt + UI_CREDENTIAL_VALIDITY_MS };
}

async function requestAuth(
  app: App,
  effectSignal: AbortSignal,
): Promise<McpUiAuth> {
  const requestController = new AbortController();
  const abortRequest = () => requestController.abort(effectSignal.reason);

  effectSignal.addEventListener("abort", abortRequest, { once: true });

  if (effectSignal.aborted) {
    abortRequest();
  }

  try {
    const result = await app.callServerTool(
      {
        name: UI_CREDENTIAL_REFRESH_TOOL,
        arguments: {},
      },
      {
        signal: requestController.signal,
        timeout: UI_CREDENTIAL_REFRESH_TIMEOUT_MS,
      },
    );

    const auth = getCredentialFromToolResultMetadata(result._meta);

    if (!auth || result.isError) {
      throw new Error("MCP UI credential refresh failed");
    }

    return auth;
  } finally {
    effectSignal.removeEventListener("abort", abortRequest);
  }
}

/**
 * Extract the UI credentials and session ID from tool result metadata.
 */
export function getCredentialFromToolResultMetadata(
  metadata: Record<string, unknown> | undefined,
): McpUiAuth | null {
  const value = metadata?.[MCP_APPS_METADATA_KEY];

  if (typeof value !== "object" || value === null) {
    return null;
  }

  const credential = "credential" in value ? value.credential : null;
  const sessionId = "sessionId" in value ? value.sessionId : null;

  if (typeof credential !== "string" || typeof sessionId !== "string") {
    return null;
  }

  return { credential, sessionId };
}
