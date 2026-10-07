import {
  type App,
  type McpUiHostContext,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  useApp,
} from "@modelcontextprotocol/ext-apps/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { fetchQueryByHandle } from "../api";
import { useMcpUiAuth } from "../auth";
import {
  getMcpQueryFetchErrorMessage,
  getMcpQueryFetchErrorType,
} from "../utils/getMcpQueryFetchError";

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

  queryError: string | null;

  hostContext: McpUiHostContext | null;
  app: App | null;
}

/**
 * What `visualize_query` and `render_drill_through` put in `structuredContent`. The query itself
 * never rides here — the tools pass a handle and the iframe exchanges it over the callback API, so
 * the query stays out of the model's context.
 */
type VisualizeQueryToolPayload = {
  query_handle?: string;
  prompt?: string;
};

/** `structuredContent` is untyped on the wire, so narrow it by checking rather than by asserting. */
function toToolPayload(structuredContent: unknown): VisualizeQueryToolPayload {
  if (typeof structuredContent !== "object" || structuredContent === null) {
    return {};
  }

  // Safe after the guard above: widening a known object to an index signature, so every field
  // read below still has to prove its own type rather than being asserted into one.
  const { query_handle: queryHandle, prompt } = structuredContent as Record<
    string,
    unknown
  >;

  return {
    query_handle: typeof queryHandle === "string" ? queryHandle : undefined,
    prompt: typeof prompt === "string" ? prompt : undefined,
  };
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
  const [toolResultVersion, setToolResultVersion] = useState(0);
  const pendingToolResultRef = useRef<VisualizeQueryToolPayload | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [hostContext, setHostContext] = useState<McpUiHostContext | null>(null);

  /** The handle whose resolution is still wanted; older ones are discarded. */
  const pendingQueryHandleRef = useRef<string | null>(null);

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
        const result = toToolPayload(params.structuredContent);

        if (result.query_handle) {
          pendingToolResultRef.current = result;

          setToolResultVersion((version) => version + 1);
        }
      };
    },
  });

  /**
   * Runs once the UI credential exists, because resolving a handle needs it.
   * The credential is refreshed on a timer, so this can fire more than once for
   * the same payload; resolution is keyed on the handle so a repeat is harmless.
   */
  const handleAuthenticated = useCallback(
    (auth: { uiCredential: string; mcpSessionId: string }) => {
      const toolResult = pendingToolResultRef.current;

      if (!toolResult) {
        return;
      }

      const { query_handle: queryHandle, prompt } = toolResult;

      // A stale failure left standing would render over a query that has since loaded.
      setQueryError(null);

      if (!queryHandle) {
        return;
      }

      pendingQueryHandleRef.current = queryHandle;

      const { instanceUrl = "" } = window.metabaseConfig ?? {};

      (async () => {
        try {
          const resolved = await fetchQueryByHandle({
            instanceUrl,
            uiCredential: auth.uiCredential,
            mcpSessionId: auth.mcpSessionId,
            queryHandle,
          });

          // Two resolutions can be in flight at once (a credential refresh
          // re-runs this). Drop this one if a newer payload has arrived, rather
          // than overwriting it with older results.
          if (pendingQueryHandleRef.current !== queryHandle) {
            return;
          }

          setQuery(resolved.query);
          setPrompt(resolved.prompt ?? prompt ?? null);
        } catch (error) {
          if (pendingQueryHandleRef.current !== queryHandle) {
            return;
          }

          console.error("Error resolving MCP query handle", error);
          setQueryError(
            getMcpQueryFetchErrorMessage(getMcpQueryFetchErrorType(error)),
          );
        }
      })();
    },
    [],
  );

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
    queryError,
    uiCredential,
    mcpSessionId,
    hostError: authError,
    hostContext,
    app,
  };
}
