import {
  type App,
  type McpUiHostContext,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  useApp,
} from "@modelcontextprotocol/ext-apps/react";
import { useEffect, useRef, useState } from "react";

import { resolveMcpQuery } from "../api";

export interface McpAppState {
  query: string | null;

  /**
   * Original user prompt that triggered this visualization, retrieved
   * from `construct_query`, e.g. "visualize orders with Metabase".
   */
  prompt: string | null;

  hostContext: McpUiHostContext | null;
  app: App | null;
  error: Error | null;
}

type VisualizeQueryToolInput = {
  /**
   * Handle returned by `construct_query`.
   *
   * This lets the frontend resolve the encoded query through `POST /api/embed-mcp/query`
   * as a fallback when MCP hosts (e.g. Claude Desktop) omits `structuredContent`
   * from the tool result.
   */
  query_handle?: string;

  query?: string;
};

type VisualizeQueryToolResult = {
  query?: string;
  prompt?: string;
};

interface McpGlobalConfig {
  instanceUrl?: string;
  uiCredential?: string;
  mcpSessionId?: string;
}

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
  const [queryResolutionError, setQueryResolutionError] =
    useState<Error | null>(null);
  const queryHandleRef = useRef<string | null>(null);

  const { app, error: connectionError } = useApp({
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
        const { query, query_handle } =
          // Unjustified type cast. FIXME
          (params.arguments as VisualizeQueryToolInput | undefined) ?? {};

        if (query) {
          setQuery(query);
          setPrompt(null);
        }

        queryHandleRef.current = query_handle ?? null;
      };

      // Fallback: ontoolinput may be missed if the tool returns instantly
      // (notification sent before the app finishes connecting).
      // Also the source of `prompt`, which visualize_query includes in structuredContent.
      app.ontoolresult = async (params) => {
        if (params.isError) {
          const errorText = params.content.find(
            (content) => content.type === "text",
          )?.text;
          setQueryResolutionError(
            new Error(errorText ?? "The MCP tool call failed."),
          );
          return;
        }

        const { query, prompt } =
          // Unjustified type cast. FIXME
          (params.structuredContent as VisualizeQueryToolResult | undefined) ??
          {};

        if (query) {
          setQuery(query);
          setPrompt(prompt ?? null);
          return;
        }

        if (queryHandleRef.current) {
          try {
            setQueryResolutionError(null);
            // Claude currently strips structuredContent from the tool-result notification.
            // Resolve the input handle directly with the iframe's narrow UI credential.
            const { instanceUrl, uiCredential, mcpSessionId } =
              // Unjustified type cast. FIXME
              (window.metabaseConfig as McpGlobalConfig | undefined) ?? {};

            if (!instanceUrl || !uiCredential || !mcpSessionId) {
              throw new Error("The MCP query resolver is not configured.");
            }

            const resolved = await resolveMcpQuery({
              instanceUrl,
              uiCredential,
              mcpSessionId,
              queryHandle: queryHandleRef.current,
            });

            if (resolved.query) {
              setQuery(resolved.query);
              setPrompt(resolved.prompt ?? null);
            } else {
              throw new Error("The MCP host did not return the query result.");
            }
          } catch (error) {
            console.error("Error resolving MCP query handle", error);
            setQueryResolutionError(
              error instanceof Error ? error : new Error(String(error)),
            );
          }
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

  return {
    query,
    prompt,
    hostContext,
    app,
    error: connectionError ?? queryResolutionError,
  };
}
