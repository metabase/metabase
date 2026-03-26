import { useEffect, useRef, useState } from "react";

import type { ColorScheme } from "metabase/lib/color-scheme";

interface HostContext {
  theme?: ColorScheme;

  styles?: {
    variables?: Record<string, string>;
    css?: { fonts?: string };
  };

  safeAreaInsets?: { top: number; right: number; bottom: number; left: number };
}

interface McpAppState {
  query: string | null;
  hostContext: HostContext | null;
}

export function useMcpApp(): McpAppState {
  const nextId = useRef(1);

  const [query, setQuery] = useState<string | null>(null);
  const [hostContext, setHostContext] = useState<HostContext | null>(null);

  useEffect(() => {
    const sendMessage = (
      method: string,
      options?: { id?: number; params?: Record<string, unknown> },
    ) => window.parent.postMessage({ jsonrpc: "2.0", method, ...options }, "*");

    function sendRequest(
      method: string,
      params: Record<string, unknown>,
    ): Promise<Record<string, unknown>> {
      const id = nextId.current++;

      sendMessage(method, { id, params });

      return new Promise((resolve, reject) => {
        const messageListener = (event: MessageEvent) => {
          if (event.data && event.data.id === id) {
            window.removeEventListener("message", messageListener);

            if (event.data.result) {
              resolve(event.data.result);
            } else if (event.data.error) {
              reject(new Error(event.data.error.message));
            }
          }
        };

        window.addEventListener("message", messageListener);
      });
    }

    function addMessageListener<T = unknown>(
      method: string,
      handler: (params: T) => void,
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

    const cleanupHostContext = addMessageListener<HostContext>(
      "ui/notifications/host-context-changed",
      (params) => applyHostContext(params),
    );

    const cleanupToolInput = addMessageListener<{
      arguments?: { query?: string };
    } | null>("ui/notifications/tool-input", (params) => {
      const query = params?.arguments?.query;

      if (query) {
        setQuery(query);
      }
    });

    // Fallback: tool-input may be missed if the tool returns instantly
    // (notification sent before the app finishes connecting).
    const cleanupToolResult = addMessageListener<{
      structuredContent?: { query?: string };
    } | null>("ui/notifications/tool-result", (params) => {
      const query = params?.structuredContent?.query;

      if (query) {
        setQuery(query);
      }
    });

    // Notify the host whenever the document body changes size so it can
    // resize the iframe to fit the content.
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        sendMessage("ui/notifications/size-changed", {
          params: { width: Math.ceil(width), height: Math.ceil(height) },
        });
      }
    });

    resizeObserver.observe(document.body);

    sendRequest("ui/initialize", {
      appCapabilities: {},
      appInfo: { name: "metabase-visualize-query", version: "1.0.0" },
      protocolVersion: "2026-01-26",
    })
      .then((result) => {
        applyHostContext((result as { hostContext?: HostContext }).hostContext);

        // Signal to the host that the app is ready to receive notifications
        // e.g. tool-input, tool-result, etc.
        sendMessage("ui/notifications/initialized");
      })
      .catch(() => {
        // ui/initialize failed — continue without host context
      });

    return () => {
      cleanupHostContext();
      cleanupToolInput();
      cleanupToolResult();
      resizeObserver.disconnect();
    };
  }, []);

  return { query, hostContext };
}
