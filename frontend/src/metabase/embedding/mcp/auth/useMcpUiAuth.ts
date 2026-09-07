import type { App } from "@modelcontextprotocol/ext-apps/react";
import { useEffect, useRef, useState } from "react";

import {
  UI_CREDENTIAL_REFRESH_INTERVAL_MS,
  UI_CREDENTIAL_REFRESH_RETRY_MS,
} from "../constants";

import { installMcpUiCredential, refreshMcpUiAuth } from "./mcpUiAuth";

type UseMcpUiAuthOptions = {
  app: App | null;
  refreshKey: number;
  onAuthenticated: () => void;
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
      refreshTimeout = window.setTimeout(() => refreshAuth(), delay);
    }

    async function refreshAuth() {
      try {
        const { auth, expiresAt } = await refreshMcpUiAuth(
          connectedApp,
          abortController,
        );

        installMcpUiCredential(auth.credential);

        setUiCredential(auth.credential);
        setMcpSessionId(auth.sessionId);
        setError(null);

        authenticatedUntilRef.current = expiresAt;
        onAuthenticated();

        scheduleCredentialExpiry();
        scheduleRefresh(UI_CREDENTIAL_REFRESH_INTERVAL_MS);
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

    return () => {
      abortController.abort();

      window.clearTimeout(credentialExpiryTimeout);
      window.clearTimeout(refreshTimeout);
    };
  }, [app, refreshKey, onAuthenticated]);

  return { uiCredential, mcpSessionId, error };
}
