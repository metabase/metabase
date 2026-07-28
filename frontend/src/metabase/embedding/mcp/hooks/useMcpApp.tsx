import {
  type App,
  type McpUiHostContext,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  useApp,
} from "@modelcontextprotocol/ext-apps/react";
import { useCallback, useEffect, useState } from "react";

import { type CardDisplayType, isCardDisplayType } from "metabase-types/api";

import { fetchQueryByHandle } from "../api";
import {
  getMcpQueryFetchErrorMessage,
  getMcpQueryFetchErrorType,
} from "../utils/getMcpQueryFetchError";

export interface McpAppState {
  query: string | null;

  /**
   * Original user prompt that triggered this visualization, retrieved
   * from `construct_query`, e.g. "visualize orders with Metabase".
   */
  prompt: string | null;

  /**
   * Chart type the tool asked for, when it asked for one. Absent means the
   * visualization infers one from the result shape.
   */
  display: CardDisplayType | null;

  /**
   * Why the query could not be resolved, when it could not be. The route has no
   * other signal to render — without one it would sit on the loading indicator
   * forever.
   */
  queryError: string | null;

  hostContext: McpUiHostContext | null;
  app: App | null;
}

interface McpGlobalConfig {
  instanceUrl?: string;
  sessionToken?: string;
  mcpSessionId?: string;
}

/**
 * The two tool payload shapes the iframe has to accept.
 *
 * v1 inlines the base64 `query` in both the tool arguments and the tool result.
 * v2 passes a `query_handle` instead and keeps the query out of the model's
 * context entirely, so the iframe resolves it over the callback API. One bundle
 * serves both surfaces, so both shapes stay supported.
 */
type VisualizeQueryToolPayload = {
  query?: string;
  query_handle?: string;
  prompt?: string;
  display?: unknown;
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
  const [display, setDisplay] = useState<CardDisplayType | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [hostContext, setHostContext] = useState<McpUiHostContext | null>(null);

  const applyPayload = useCallback(
    async ({
      query,
      query_handle: queryHandle,
      prompt,
      display,
    }: VisualizeQueryToolPayload) => {
      if (!query && !queryHandle) {
        return;
      }

      // Set for every payload that names a query, not only those asking for a
      // chart type: `render_drill_through` never asks for one, and without the
      // reset the previous query's display would be applied to the new results.
      // The tool's display enum and this bundle's list are versioned separately,
      // so an unrecognized value falls back to the inferred display.
      setDisplay(isCardDisplayType(display) ? display : null);

      if (query) {
        setQuery(query);
        setPrompt(prompt ?? null);
        return;
      }

      if (!queryHandle) {
        return;
      }

      // Cleared up front so the retry the host sends on `ontoolresult` can
      // recover from a failed `ontoolinput` resolution.
      setQueryError(null);

      const { instanceUrl, sessionToken, mcpSessionId } =
        // Unjustified type cast. FIXME
        (window.metabaseConfig as McpGlobalConfig | undefined) ?? {};

      if (!instanceUrl || !sessionToken || !mcpSessionId) {
        setQueryError(getMcpQueryFetchErrorMessage("network"));
        return;
      }

      try {
        const resolved = await fetchQueryByHandle({
          instanceUrl,
          sessionToken,
          mcpSessionId,
          queryHandle,
        });

        setQuery(resolved.query);
        setPrompt(resolved.prompt ?? prompt ?? null);
      } catch (error) {
        console.error("Error resolving MCP query handle", error);
        setQueryError(
          getMcpQueryFetchErrorMessage(getMcpQueryFetchErrorType(error)),
        );
      }
    },
    [],
  );

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
        const args =
          // Unjustified type cast. FIXME
          (params.arguments as VisualizeQueryToolPayload | undefined) ?? {};

        // v2's `query` argument is an MBQL object, not the base64 string the
        // card is built from — only the handle is renderable from the input.
        // A model that passed an inline query is served by ontoolresult below.
        if (args.query_handle) {
          void applyPayload({
            query_handle: args.query_handle,
            display: args.display,
          });
        } else if (typeof args.query === "string") {
          void applyPayload({ query: args.query });
        }
      };

      // Fallback: ontoolinput may be missed if the tool returns instantly
      // (notification sent before the app finishes connecting).
      // Also the source of `prompt`, which visualize_query includes in structuredContent.
      app.ontoolresult = (params) => {
        const result =
          // Unjustified type cast. FIXME
          (params.structuredContent as VisualizeQueryToolPayload | undefined) ??
          {};

        void applyPayload(result);
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

  return { query, prompt, display, queryError, hostContext, app };
}
