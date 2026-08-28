import {
  type App,
  type McpUiHostContext,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  useApp,
} from "@modelcontextprotocol/ext-apps/react";
import { useEffect, useState } from "react";

import {
  UI_CREDENTIAL_REFRESH_INTERVAL_MS,
  UI_CREDENTIAL_REFRESH_MAX_FAILURES,
  UI_CREDENTIAL_REFRESH_RETRY_MS,
  UI_CREDENTIAL_REFRESH_TOOL,
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

export function useMcpApp(): McpAppState {
  const [query, setQuery] = useState<string | null>(null);
  const [toolResultVersion, setToolResultVersion] = useState(0);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [uiCredential, setUiCredential] = useState("");
  const [mcpSessionId, setMcpSessionId] = useState("");
  const [hostError, setHostError] = useState<string | null>(null);
  const [hostContext, setHostContext] = useState<McpUiHostContext | null>(null);

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
          // Prevent the new tool result from using the previous result's credential and session ID.
          setUiCredential("");
          setMcpSessionId("");
          setToolResultVersion((version) => version + 1);

          setQuery(query);
          setPrompt(prompt ?? null);
          setHostError(null);
        }
      };
    },
  });

  useEffect(() => {
    if (!app || !query) {
      return;
    }

    let cancelled = false;
    let consecutiveRefreshFailures = 0;
    let hasAuthenticated = false;
    let refreshTimeout: number | undefined;

    const applyAuth = (auth: McpUiAuth) => {
      if (!cancelled) {
        installMcpUiCredential(auth.credential);
        setUiCredential(auth.credential);
        setMcpSessionId(auth.sessionId);
      }
    };

    if (!app.getHostCapabilities()?.serverTools) {
      const hostName = app.getHostVersion()?.name.trim() || "Your MCP client";

      setHostError(`${hostName} does not support this visualization.`);
      return;
    }

    const refreshAuth = async () => {
      try {
        const result = await app.callServerTool({
          name: UI_CREDENTIAL_REFRESH_TOOL,
          arguments: {},
        });

        const refreshedAuth = getMcpUiAuthFromToolMetadata(result._meta);

        if (!refreshedAuth || result.isError) {
          throw new Error("MCP UI credential refresh failed");
        }

        applyAuth(refreshedAuth);
        consecutiveRefreshFailures = 0;
        hasAuthenticated = true;

        if (!cancelled) {
          refreshTimeout = window.setTimeout(
            refreshAuth,
            UI_CREDENTIAL_REFRESH_INTERVAL_MS,
          );
        }
      } catch (error) {
        console.error("Error refreshing MCP UI credential", error);
        consecutiveRefreshFailures += 1;

        if (
          !hasAuthenticated &&
          consecutiveRefreshFailures >= UI_CREDENTIAL_REFRESH_MAX_FAILURES
        ) {
          if (!cancelled) {
            setHostError(
              "This visualization did not load. Ask your MCP client to show it again.",
            );
          }

          return;
        }

        if (!cancelled) {
          refreshTimeout = window.setTimeout(
            refreshAuth,
            UI_CREDENTIAL_REFRESH_RETRY_MS,
          );
        }
      }
    };

    refreshAuth();

    return () => {
      cancelled = true;
      window.clearTimeout(refreshTimeout);
    };
  }, [app, query, toolResultVersion]);

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
