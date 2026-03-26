import { useEffect, useMemo, useRef, useState } from "react";

import type { MetabaseTheme } from "embedding-sdk-bundle/types/theme";
import { InteractiveQuestion, MetabaseProvider } from "embedding-sdk-package";
import { b64_to_utf8 } from "metabase/lib/encoding";
import type { Card } from "metabase-types/api";

declare global {
  interface Window {
    metabaseConfig?: {
      instanceUrl: string;
      sessionToken: string;
    };
  }
}

// ---- MCP postMessage protocol -----------------------------------------------

type ColorScheme = "light" | "dark";
type HostVars = Record<string, string>;

interface HostContext {
  theme?: ColorScheme;
  styles?: {
    variables?: HostVars;
    css?: { fonts?: string };
  };
  safeAreaInsets?: { top: number; right: number; bottom: number; left: number };
}

interface McpAppState {
  query: string | null;
  hostContext: HostContext | null;
}

function useMcpApp(): McpAppState {
  const [query, setQuery] = useState<string | null>(null);
  const [hostContext, setHostContext] = useState<HostContext | null>(null);
  const nextId = useRef(1);

  useEffect(() => {
    function sendRequest(
      method: string,
      params: Record<string, unknown>,
    ): Promise<Record<string, unknown>> {
      const id = nextId.current++;
      window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");

      return new Promise((resolve, reject) => {
        function listener(event: MessageEvent) {
          if (event.data && event.data.id === id) {
            window.removeEventListener("message", listener);
            if (event.data.result) {
              resolve(event.data.result);
            } else if (event.data.error) {
              reject(new Error(event.data.error.message));
            }
          }
        }
        window.addEventListener("message", listener);
      });
    }

    function onNotification(
      method: string,
      handler: (params: unknown) => void,
    ): () => void {
      function listener(event: MessageEvent) {
        if (event.data && event.data.method === method) {
          handler(event.data.params);
        }
      }
      window.addEventListener("message", listener);
      return () => window.removeEventListener("message", listener);
    }

    function applyHostContext(ctx: HostContext | null | undefined) {
      if (!ctx) {
        return;
      }
      if (ctx.styles?.variables) {
        const root = document.documentElement;
        Object.entries(ctx.styles.variables).forEach(([key, value]) => {
          root.style.setProperty(key, value);
        });
      }
      if (ctx.styles?.css?.fonts) {
        const style = document.createElement("style");
        style.textContent = ctx.styles.css.fonts;
        document.head.appendChild(style);
      }
      setHostContext(ctx);
    }

    function showQuery(q: string | null | undefined) {
      if (q) {
        setQuery(q);
      }
    }

    const cleanupHostContext = onNotification(
      "ui/notifications/host-context",
      (params) => applyHostContext(params as HostContext),
    );

    const cleanupToolInput = onNotification(
      "ui/notifications/tool-input",
      (params) => {
        const p = params as { arguments?: { query?: string } } | null;
        showQuery(p?.arguments?.query);
      },
    );

    // Fallback: tool-input may be missed if the tool returns instantly
    // (notification sent before the app finishes connecting).
    const cleanupToolResult = onNotification(
      "ui/notifications/tool-result",
      (params) => {
        const p = params as { structuredContent?: { query?: string } } | null;
        showQuery(p?.structuredContent?.query);
      },
    );

    sendRequest("ui/initialize", {
      capabilities: {},
      clientInfo: { name: "metabase-visualize-query", version: "1.0.0" },
      protocolVersion: "2025-06-18",
    })
      .then((result) => {
        applyHostContext((result as { hostContext?: HostContext }).hostContext);
      })
      .catch(() => {
        // ui/initialize failed — continue without host context
      });

    return () => {
      cleanupHostContext();
      cleanupToolInput();
      cleanupToolResult();
    };
  }, []);

  return { query, hostContext };
}

// ---- Theme ------------------------------------------------------------------

const LIGHT_FALLBACKS: HostVars = {
  "--color-background-primary": "#ffffff",
  "--color-background-secondary": "#f5f5f5",
  "--color-background-disabled": "#e5e5e5",
  "--color-text-primary": "#171717",
  "--color-text-secondary": "#6b6b6b",
  "--color-text-tertiary": "#a3a3a3",
  "--color-border-secondary": "#e5e5e5",
};

const DARK_FALLBACKS: HostVars = {
  "--color-background-primary": "#1c1c1e",
  "--color-background-secondary": "#2c2c2e",
  "--color-background-disabled": "#3a3a3c",
  "--color-text-primary": "#f5f5f7",
  "--color-text-secondary": "#aeaeb2",
  "--color-text-tertiary": "#636366",
  "--color-border-secondary": "#38383a",
};

/**
 * Resolve a CSS value that may contain var() references into a concrete color.
 * MCP hosts like VSCode send CSS variable references (e.g. `var(--vscode-editor-background)`)
 * as theming values. The SDK requires concrete color values, so we resolve them
 * via the browser's computed style cascade.
 */
function resolveColor(value: string): string {
  if (!value || !value.includes("var(")) {
    return value;
  }
  const el = document.createElement("div");
  el.style.color = value;
  document.body.appendChild(el);
  const resolved = getComputedStyle(el).color;
  document.body.removeChild(el);
  return resolved || value;
}

function buildTheme(hostVars: HostVars, scheme: ColorScheme): MetabaseTheme {
  const fallbacks = scheme === "light" ? LIGHT_FALLBACKS : DARK_FALLBACKS;
  const c = (key: string) =>
    resolveColor(hostVars[key] || fallbacks[key] || DARK_FALLBACKS[key]);

  return {
    colors: {
      background: c("--color-background-primary"),
      "background-secondary": c("--color-background-secondary"),
      "background-disabled": c("--color-background-disabled"),
      "text-primary": c("--color-text-primary"),
      "text-secondary": c("--color-text-secondary"),
      "text-tertiary": c("--color-text-tertiary"),
      border: c("--color-border-secondary"),
    },
  };
}

// ---- Query rendering --------------------------------------------------------

function useDeserializedCard(query: string | null): Card | null {
  return useMemo(() => {
    if (!query) {
      return null;
    }
    try {
      return {
        display: "table",
        dataset_query: JSON.parse(b64_to_utf8(query)),
        visualization_settings: {},
      } as Card;
    } catch {
      return null;
    }
  }, [query]);
}

// ---- Root component ---------------------------------------------------------

export function McpUiAppRoute() {
  const { query, hostContext } = useMcpApp();

  const scheme: ColorScheme = (hostContext?.theme as ColorScheme) ?? "dark";
  const hostVars: HostVars = hostContext?.styles?.variables ?? {};
  const safeAreaInsets = hostContext?.safeAreaInsets ?? {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  };

  const theme = useMemo(
    () => buildTheme(hostVars, scheme),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(hostVars), scheme],
  );

  const deserializedCard = useDeserializedCard(query);

  const { instanceUrl, sessionToken } = window.metabaseConfig ?? {
    instanceUrl: "",
    sessionToken: "",
  };

  const padding = `${Math.max(safeAreaInsets.top, 0)}px ${Math.max(safeAreaInsets.right, 0)}px ${Math.max(safeAreaInsets.bottom, 0)}px ${Math.max(safeAreaInsets.left, 0)}px`;

  return (
    <MetabaseProvider
      authConfig={{ metabaseInstanceUrl: instanceUrl, sessionToken }}
      theme={theme}
    >
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: theme.colors?.background,
          padding,
          boxSizing: "border-box",
        }}
      >
        {deserializedCard && (
          <InteractiveQuestion
            deserializedCard={deserializedCard}
            isSaveEnabled={false}
          />
        )}
      </div>
    </MetabaseProvider>
  );
}
