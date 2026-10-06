import type { App } from "@modelcontextprotocol/ext-apps/react";
import { useEffect, useRef, useState } from "react";

import {
  UI_CREDENTIAL_REFRESH_INTERVAL_MS,
  UI_CREDENTIAL_REFRESH_RETRY_MS,
} from "../constants";

import { setMcpCredentialRefresher } from "./credentialRefresh";
import {
  type McpUiAuth,
  installMcpUiCredential,
  refreshMcpUiAuth,
} from "./mcpUiAuth";

type UseMcpUiAuthOptions = {
  app: App | null;
  refreshKey: number;
  onAuthenticated: (auth: {
    uiCredential: string;
    mcpSessionId: string;
  }) => void;
};

export function useMcpUiAuth({
  app,
  refreshKey,
  onAuthenticated,
}: UseMcpUiAuthOptions) {
  const [uiCredential, setUiCredential] = useState("");
  const [mcpSessionId, setMcpSessionId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const authenticatedUntilRef = useRef<number | null>(null);

  useEffect(() => {
    if (!app || refreshKey === 0) {
      return;
    }

    if (!app.getHostCapabilities()?.serverTools) {
      const hostName = app.getHostVersion()?.name.trim() || "Your MCP client";

      setError(`${hostName} does not support query visualization.`);
      return;
    }

    const connectedApp = app;
    const abortController = new AbortController();

    let credentialExpiryTimeout: number | undefined;
    let refreshTimeout: number | undefined;

    function clearAuth() {
      authenticatedUntilRef.current = null;

      setUiCredential("");
      setMcpSessionId("");
    }

    function scheduleCredentialExpiry() {
      window.clearTimeout(credentialExpiryTimeout);
      const authenticatedUntil = authenticatedUntilRef.current;

      if (authenticatedUntil === null) {
        return;
      }

      const expiresIn = authenticatedUntil - Date.now();

      if (expiresIn <= 0) {
        clearAuth();
        return;
      }

      credentialExpiryTimeout = window.setTimeout(() => {
        if (authenticatedUntilRef.current === authenticatedUntil) {
          clearAuth();
        }
      }, expiresIn);
    }

    function scheduleRefresh(delay: number) {
      window.clearTimeout(refreshTimeout);
      refreshTimeout = window.setTimeout(() => refreshAuth(), delay);
    }

    async function authenticate(): Promise<McpUiAuth> {
      const { auth, expiresAt } = await refreshMcpUiAuth(
        connectedApp,
        abortController,
      );

      installMcpUiCredential(auth);

      setUiCredential(auth.credential);
      setMcpSessionId(auth.sessionId);
      setError(null);

      authenticatedUntilRef.current = expiresAt;
      // Passed through rather than read from state: the consumer resolves a
      // query handle here, and the state setters above have not committed yet.
      onAuthenticated({
        uiCredential: auth.credential,
        mcpSessionId: auth.sessionId,
      });

      scheduleCredentialExpiry();
      scheduleRefresh(UI_CREDENTIAL_REFRESH_INTERVAL_MS);

      return auth;
    }

    async function refreshAuth() {
      try {
        await authenticate();
      } catch {
        if (abortController.signal.aborted) {
          return;
        }

        const authenticatedUntil = authenticatedUntilRef.current;

        if (authenticatedUntil === null || authenticatedUntil <= Date.now()) {
          clearAuth();
          setError(
            "This visualization did not load. Ask your MCP client to show it again.",
          );
          return;
        }

        scheduleRefresh(UI_CREDENTIAL_REFRESH_RETRY_MS);
      }
    }

    setError(null);
    scheduleCredentialExpiry();
    refreshAuth();

    // An iframe route refused the credential, so get a new one now rather than
    // at the next scheduled refresh.
    setMcpCredentialRefresher(authenticate);

    return () => {
      setMcpCredentialRefresher(null);
      abortController.abort();

      window.clearTimeout(credentialExpiryTimeout);
      window.clearTimeout(refreshTimeout);
    };
  }, [app, refreshKey, onAuthenticated]);

  return { uiCredential, mcpSessionId, error };
}
