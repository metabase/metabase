import {
  type McpUiHostContext,
  useApp,
  useHostFonts,
  useHostStyleVariables,
} from "@modelcontextprotocol/ext-apps/react";
import { useEffect, useState } from "react";

interface McpAppState {
  query: string | null;
  hostContext: McpUiHostContext | null;
}

export function useMcpApp(): McpAppState {
  const [query, setQuery] = useState<string | null>(null);
  const [hostContext, setHostContext] = useState<McpUiHostContext | null>(null);

  const { app } = useApp({
    appInfo: { name: "metabase-visualize-query", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (app) => {
      app.onhostcontextchanged = (ctx) => {
        if (ctx) {
          setHostContext((prev) => ({ ...prev, ...ctx }));
        }
      };

      app.ontoolinput = (params) => {
        const q = (params.arguments as { query?: string } | undefined)?.query;
        if (q) {
          setQuery(q);
        }
      };

      // Fallback: ontoolinput may be missed if the tool returns instantly
      // (notification sent before the app finishes connecting).
      app.ontoolresult = (params) => {
        const q = (params.structuredContent as { query?: string } | undefined)
          ?.query;
        if (q) {
          setQuery(q);
        }
      };
    },
  });

  // Read initial host context once connected
  useEffect(() => {
    if (!app) {
      return;
    }

    const ctx = app.getHostContext();
    if (ctx) {
      setHostContext(ctx);
    }
  }, [app]);

  // Apply host CSS variables, theme and fonts to the document
  useHostStyleVariables(app, app?.getHostContext());
  useHostFonts(app, app?.getHostContext());

  return { query, hostContext };
}
