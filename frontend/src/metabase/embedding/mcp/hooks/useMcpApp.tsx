import {
  type App,
  type McpUiHostContext,
  type McpUiToolResultNotification,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  useApp,
} from "@modelcontextprotocol/ext-apps/react";
import { useEffect, useRef, useState } from "react";
import { useAsyncFn } from "react-use";

import { resolveMcpQueryHandle } from "../api";
import { getMcpMetabaseConfig } from "../config";

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
   * This lets the frontend resolve the encoded query through
   * `POST /api/embed-mcp/query-handle/resolve`
   * as a fallback when MCP hosts (e.g. Claude Desktop) strips `structuredContent`
   * from the tool result.
   */
  query_handle?: string;

  query?: string;
};

type VisualizeQueryToolResult = {
  query?: string;
  prompt?: string;
};

type ToolCallResult = McpUiToolResultNotification["params"];

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

  const queryHandleRef = useRef<string | null>(null);
  const inlineQueryRef = useRef<string | null>(null);

  const [{ error: toolCallResultError }, handleToolCallResult] = useAsyncFn(
    async (callResult: ToolCallResult) => {
      if (callResult.isError) {
        const errorText = callResult.content.find(
          (content) => content.type === "text",
        )?.text;

        throw new Error(errorText ?? "Tool call failed.");
      }

      const { query, prompt } =
        // structuredContent is typed as unknown
        (callResult.structuredContent ?? {}) as VisualizeQueryToolResult;

      // If `query` is resolved from structuredContent, use it.
      if (query) {
        setQuery(query);
        setPrompt(prompt ?? null);

        return;
      }

      // Workaround: Claude strips structuredContent from the tool result.
      // Resolve the query handle manually on the frontend.
      if (inlineQueryRef.current) {
        return;
      }

      const queryHandle = queryHandleRef.current;

      if (!queryHandle) {
        throw new Error("Query cannot be resolved.");
      }

      const { instanceUrl, uiCredential, mcpSessionId } =
        getMcpMetabaseConfig();

      if (!instanceUrl || !uiCredential || !mcpSessionId) {
        throw new Error("Credential or MCP session is invalid.");
      }

      const resolvedHandle = await resolveMcpQueryHandle({
        instanceUrl,
        uiCredential,
        mcpSessionId,
        queryHandle,
      });

      if (!resolvedHandle.query) {
        throw new Error("Query cannot be resolved.");
      }

      setQuery(resolvedHandle.query);
      setPrompt(resolvedHandle.prompt ?? null);
    },
    [],
  );

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
          inlineQueryRef.current = query;

          setQuery(query);
          setPrompt(null);
        }

        queryHandleRef.current = query_handle ?? null;
      };

      app.ontoolresult = handleToolCallResult;
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
    error: connectionError ?? toolCallResultError ?? null,
  };
}
