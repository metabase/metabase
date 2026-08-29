import {
  type App,
  type McpUiHostContext,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  useApp,
} from "@modelcontextprotocol/ext-apps/react";
import { useEffect, useRef, useState } from "react";

import { retry } from "metabase/utils/retry";

import {
  UI_CREDENTIAL_REFRESH_INTERVAL_MS,
  UI_CREDENTIAL_REFRESH_MAX_FAILURES,
  UI_CREDENTIAL_REFRESH_RETRY_MS,
  UI_CREDENTIAL_REFRESH_TIMEOUT_MS,
  UI_CREDENTIAL_REFRESH_TOOL,
  UI_CREDENTIAL_VALIDITY_MS,
} from "../constants";
import {
  type McpUiAuth,
  getMcpUiAuthFromToolMetadata,
  installMcpUiCredential,
} from "../utils/uiCredential";

export interface McpAppState {
  query: string | null;

  uiCredential: string;
  mcpSessionId: string;
  hostError: string | null;

  /**
   * Original user prompt that triggered this visualization, retrieved
   * from `construct_query`, e.g. "visualize orders with Metabase".
   */
  prompt: string | null;

  hostContext: McpUiHostContext | null;
  app: App | null;
}

type VisualizeQueryToolResult = {
  query?: string;
  prompt?: string;
};

function applyHostContext(ctx: McpUiHostContext) {
  if (ctx.theme) {
    applyDocumentTheme(ctx.theme);
  }

  if (ctx.styles?.variables) {
    applyHostStyleVariables(ctx.styles.variables);
  }

  if (ctx.styles?.css?.fonts) {
    applyHostFonts(ctx.styles.css.fonts);
  }
}

async function requestMcpUiAuth(
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

    const auth = getMcpUiAuthFromToolMetadata(result._meta);

    if (!auth || result.isError) {
      throw new Error("MCP UI credential refresh failed");
    }

    return auth;
  } finally {
    effectSignal.removeEventListener("abort", abortRequest);
  }
}

export function useMcpApp(): McpAppState {
  const [query, setQuery] = useState<string | null>(null);
  const [toolResultVersion, setToolResultVersion] = useState(0);
  const pendingToolResultRef = useRef<VisualizeQueryToolResult | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [uiCredential, setUiCredential] = useState("");
  const [mcpSessionId, setMcpSessionId] = useState("");
  const [hostError, setHostError] = useState<string | null>(null);
  const [hostContext, setHostContext] = useState<McpUiHostContext | null>(null);
  const authenticatedAppRef = useRef<{
    app: App;
    expiresAt: number;
  } | null>(null);

  const { app } = useApp({
    appInfo: { name: "metabase-visualize-query", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (app) => {
      app.onhostcontextchanged = (context) => {
        if (context) {
          applyHostContext(context);
          setHostContext((prev) => ({ ...prev, ...context }));
        }
      };

      app.ontoolresult = (params) => {
        const { query, prompt } =
          // Unjustified type cast. FIXME
          (params.structuredContent as VisualizeQueryToolResult | undefined) ??
          {};

        if (query) {
          const authenticatedApp = authenticatedAppRef.current;

          if (
            authenticatedApp?.app === app &&
            authenticatedApp.expiresAt <= Date.now()
          ) {
            authenticatedAppRef.current = null;
            setUiCredential("");
            setMcpSessionId("");
          }

          pendingToolResultRef.current = { query, prompt };
          setToolResultVersion((version) => version + 1);
          setHostError(null);
        }
      };
    },
  });

  useEffect(() => {
    const toolResult = pendingToolResultRef.current;

    if (!app || !toolResult?.query || toolResultVersion === 0) {
      return;
    }

    // Every modern MCP App client should support server tools, but some older clients may not.
    if (!app.getHostCapabilities()?.serverTools) {
      const hostName = app.getHostVersion()?.name.trim() || "Your MCP client";

      setHostError(`${hostName} does not support query visualization.`);
      return;
    }

    const connectedApp = app;

    const abortController = new AbortController();
    let credentialExpiryTimeout: number | undefined;
    let refreshTimeout: number | undefined;

    function scheduleCredentialExpiry() {
      window.clearTimeout(credentialExpiryTimeout);

      const authenticatedApp = authenticatedAppRef.current;

      if (authenticatedApp?.app !== connectedApp) {
        return;
      }

      const expiresIn = authenticatedApp.expiresAt - Date.now();

      if (expiresIn <= 0) {
        authenticatedAppRef.current = null;
        setUiCredential("");
        setMcpSessionId("");
        return;
      }

      credentialExpiryTimeout = window.setTimeout(() => {
        if (authenticatedAppRef.current === authenticatedApp) {
          authenticatedAppRef.current = null;
          setUiCredential("");
          setMcpSessionId("");
        }
      }, expiresIn);
    }

    function scheduleRefresh(delay: number) {
      refreshTimeout = window.setTimeout(() => refreshMcpAuth(), delay);
    }

    async function refreshMcpAuth() {
      let requestStartedAt = Date.now();

      try {
        const auth = await retry(
          () => {
            requestStartedAt = Date.now();
            return requestMcpUiAuth(connectedApp, abortController.signal);
          },
          {
            maxRetries: UI_CREDENTIAL_REFRESH_MAX_FAILURES - 1,
            shouldRetry: (error) => {
              if (abortController.signal.aborted) {
                return false;
              }

              console.error("Error refreshing MCP UI credential", error);

              return true;
            },
            delayMs: () => UI_CREDENTIAL_REFRESH_RETRY_MS,
            signal: abortController.signal,
          },
        );

        abortController.signal.throwIfAborted();

        installMcpUiCredential(auth.credential);
        setUiCredential(auth.credential);
        setMcpSessionId(auth.sessionId);
        setQuery(toolResult.query);
        setPrompt(toolResult.prompt ?? null);

        authenticatedAppRef.current = {
          app: connectedApp,
          expiresAt: requestStartedAt + UI_CREDENTIAL_VALIDITY_MS,
        };

        scheduleCredentialExpiry();
        scheduleRefresh(UI_CREDENTIAL_REFRESH_INTERVAL_MS);
      } catch {
        if (abortController.signal.aborted) {
          return;
        }

        const authenticatedApp = authenticatedAppRef.current;

        if (
          authenticatedApp?.app !== connectedApp ||
          authenticatedApp.expiresAt <= Date.now()
        ) {
          authenticatedAppRef.current = null;
          setUiCredential("");
          setMcpSessionId("");
          setHostError(
            "This visualization did not load. Ask your MCP client to show it again.",
          );

          return;
        }

        scheduleRefresh(UI_CREDENTIAL_REFRESH_RETRY_MS);
      }
    }

    scheduleCredentialExpiry();
    refreshMcpAuth();

    return () => {
      abortController.abort();
      window.clearTimeout(credentialExpiryTimeout);
      window.clearTimeout(refreshTimeout);
    };
  }, [app, toolResultVersion]);

  // Read host context once connected and apply styles immediately
  useEffect(() => {
    if (app) {
      const context = app.getHostContext();

      if (context) {
        applyHostContext(context);
        setHostContext(context);
      }
    }
  }, [app]);

  return {
    query,
    prompt,
    uiCredential,
    mcpSessionId,
    hostError,
    hostContext,
    app,
  };
}
