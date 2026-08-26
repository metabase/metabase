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
  type McpUiAuth,
  getMcpUiAuth,
  installMcpUiCredential,
} from "../utils/mcpUiCredential";

export interface McpAppState {
  query: string | null;

  uiCredential: string;
  mcpSessionId: string;

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

const UI_CREDENTIAL_REFRESH_INTERVAL_MS = 4 * 60 * 1000;
const UI_CREDENTIAL_REFRESH_RETRY_MS = 30 * 1000;

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

export function useMcpApp(resourceRefreshTool = ""): McpAppState {
  const [query, setQuery] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [uiCredential, setUiCredential] = useState("");
  const [mcpSessionId, setMcpSessionId] = useState("");
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
          setUiCredential("");
          setMcpSessionId("");
          setQuery(query);
          setPrompt(prompt ?? null);
        }
      };
    },
  });

  useEffect(() => {
    if (!app || !query || !resourceRefreshTool) {
      return;
    }

    let cancelled = false;
    let refreshTimeout: number | undefined;

    const applyAuth = (auth: McpUiAuth) => {
      if (!cancelled) {
        installMcpUiCredential(auth.credential);
        setUiCredential(auth.credential);
        setMcpSessionId(auth.sessionId);
      }
    };

    if (!app.getHostCapabilities()?.serverTools) {
      return;
    }

    const refreshAuth = async () => {
      try {
        const result = await app.callServerTool({
          name: resourceRefreshTool,
          arguments: {},
        });

        const refreshedAuth = getMcpUiAuth(result._meta);

        if (!refreshedAuth || result.isError) {
          throw new Error("MCP UI credential refresh failed");
        }

        applyAuth(refreshedAuth);

        if (!cancelled) {
          refreshTimeout = window.setTimeout(
            refreshAuth,
            UI_CREDENTIAL_REFRESH_INTERVAL_MS,
          );
        }
      } catch (error) {
        console.error("Error refreshing MCP UI credential", error);

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
  }, [app, query, resourceRefreshTool]);

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

  return { query, prompt, uiCredential, mcpSessionId, hostContext, app };
}
