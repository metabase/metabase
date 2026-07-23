import path from "node:path";

import type { Plugin } from "vite";

import { validateDataAppManifest } from "../config/validate-manifest";
import { DATA_APP_REBUILT_EVENT } from "../constants/bundle";
import {
  DATA_APP_DIAGNOSTICS_CHANGED_EVENT,
  DATA_APP_DIAGNOSTICS_EVENT,
} from "../constants/diagnostics-channel";
import { DATA_APP_MANIFEST_FILE_NAME } from "../constants/paths";
import type { DataAppManifestStatus } from "../types/manifest-status";

import { createAppBundle, serveAppBundle } from "./app-bundle";
import { createDiagnosticsStore } from "./diagnostics-store";
import { serveDiagnostics } from "./serve-diagnostics";
import { serveIndexHtml } from "./serve-index-html";
import {
  loadDataAppVirtualModule,
  resolveDataAppVirtualId,
} from "./virtual-modules";

export function dataAppSandboxDevPlugin(
  appSlug: string,
  allowedHosts: string[],
): Plugin {
  const diagnostics = createDiagnosticsStore();
  let manifestStatus: DataAppManifestStatus | null = null;

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

      server.ws.on(DATA_APP_DIAGNOSTICS_EVENT, (message) => {
        if (diagnostics.ingest(message)) {
          server.ws.send({
            type: "custom",
            event: DATA_APP_DIAGNOSTICS_CHANGED_EVENT,
          });
        }
      });

      server.middlewares.use(
        serveDiagnostics({
          store: diagnostics,
          getManifest: () => manifestStatus,
          getClients: () => server.ws.clients.size,
          getLastRebuildAt: () => bundle.lastRebuildAt,
        }),
      );

      const srcDir = `${path.sep}src${path.sep}`;
      server.watcher.on("change", async (file) => {
        if (file.includes(srcDir) && (await bundle.rebuild())) {
          server.ws.send({ type: "custom", event: DATA_APP_REBUILT_EVENT });
        }
      });

      const refreshManifestStatus = () => {
        manifestStatus = validateDataAppManifest(root, allowedHosts);
      };

      refreshManifestStatus();

      server.watcher.on("all", (_event, file) => {
        if (path.basename(file) === DATA_APP_MANIFEST_FILE_NAME) {
          refreshManifestStatus();
        }
      });

      return () => {
        server.middlewares.use(serveIndexHtml(server));
      };
    },
  };
}
