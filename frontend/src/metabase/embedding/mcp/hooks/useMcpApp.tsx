import {
  type App,
  type McpUiHostContext,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  useApp,
} from "@modelcontextprotocol/ext-apps/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useMcpUiAuth } from "../auth";

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
  const pendingToolResultRef = useRef<VisualizeQueryToolResult | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [hostContext, setHostContext] = useState<McpUiHostContext | null>(null);

  // `app` is stable across re-renders
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
          pendingToolResultRef.current = { query, prompt };

          setToolResultVersion((version) => version + 1);
        }
      };
    },
  });

  const handleAuthenticated = useCallback(() => {
    const toolResult = pendingToolResultRef.current;

    if (!toolResult?.query) {
      return;
    }

    setQuery(toolResult.query);
    setPrompt(toolResult.prompt ?? null);
  }, []);

  const {
    uiCredential,
    mcpSessionId,
    error: authError,
  } = useMcpUiAuth({
    app,
    refreshKey: toolResultVersion,
    onAuthenticated: handleAuthenticated,
  });

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
    hostError: authError,
    hostContext,
    app,
  };
}
