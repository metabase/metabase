import path from "node:path";

import type { Plugin } from "vite";

import { DATA_APP_REBUILT_EVENT } from "../constants/bundle";

import { createAppBundle, serveAppBundle } from "./app-bundle";
import { serveIndexHtml } from "./serve-index-html";
import {
  loadDataAppVirtualModule,
  resolveDataAppVirtualId,
} from "./virtual-modules";

export function dataAppSandboxDevPlugin(
  appSlug: string,
  allowedHosts: string[],
): Plugin {
  return {
    name: "metabase-data-app-dev",
    apply: "serve",

    resolveId: (id) => resolveDataAppVirtualId(id),

    load: (id) => loadDataAppVirtualModule(id, { appSlug, allowedHosts }),

    async configureServer(server) {
      const { root, mode } = server.config;

      const bundle = createAppBundle({
        root,
        mode,
        onError: (message) => server.config.logger.error(message),
      });

      await bundle.rebuild();

      server.middlewares.use(serveAppBundle(bundle));

      const srcDir = `${path.sep}src${path.sep}`;
      server.watcher.on("change", async (file) => {
        if (file.includes(srcDir) && (await bundle.rebuild())) {
          server.ws.send({ type: "custom", event: DATA_APP_REBUILT_EVENT });
        }
      });

      return () => {
        server.middlewares.use(serveIndexHtml(server));
      };
    },
  };
}
