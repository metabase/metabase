import {
  type App,
  type McpUiHostContext,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  useApp,
} from "@modelcontextprotocol/ext-apps/react";
import { useEffect, useState } from "react";

interface McpAppState {
  query: string | null;

  /**
   * Original user prompt that triggered this visualization, retrieved
   * from `construct_query`, e.g. "visualize orders with Metabase".
   */
  prompt: string | null;

  hostContext: McpUiHostContext | null;
  app: App | null;
}

type VisualizeQueryToolInput = {
  query?: string;
};

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
  const [prompt, setPrompt] = useState<string | null>(null);
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

      app.ontoolinput = (params) => {
        const { query } =
          (params.arguments as VisualizeQueryToolInput | undefined) ?? {};

        if (query) {
          setQuery(query);
          setPrompt(null);
        }
      };

      // Fallback: ontoolinput may be missed if the tool returns instantly
      // (notification sent before the app finishes connecting).
      // Also the source of `prompt`, which visualize_query includes in structuredContent.
      app.ontoolresult = (params) => {
        const { query, prompt } =
          (params.structuredContent as VisualizeQueryToolResult | undefined) ??
          {};

        if (query) {
          setQuery(query);
          setPrompt(prompt ?? null);
        }
      };
    },
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

  return { query, prompt, hostContext, app };
}
