import type { Connect, ViteDevServer } from "vite";

import { INDEX_HTML } from "../constants/index-html";

export const serveIndexHtml =
  (server: ViteDevServer): Connect.NextHandleFunction =>
  async (req, res, next) => {
    if (req.method !== "GET" || !req.headers.accept?.includes("text/html")) {
      next();

      return;
    }

    try {
      const html = await server.transformIndexHtml(req.url ?? "/", INDEX_HTML);

      res.statusCode = 200;

      // This response bypasses the static-file layer that would apply them, and
      // one of them is the CSP the preview needs to match production.
      const configuredHeaders = server.config.server.headers;
      if (configuredHeaders) {
        for (const [name, value] of Object.entries(configuredHeaders)) {
          if (value != null) {
            res.setHeader(name, value);
          }
        }
      }

      res.setHeader("Content-Type", "text/html");
      res.end(html);
    } catch (error) {
      next(error);
    }
  };
