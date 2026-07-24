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

import { createAppBundle } from "./app-bundle";
import { DiagnosticsStore } from "./diagnostics-store";
import { getAppBundleMiddleware } from "./middlewares/app-bundle-middleware";
import { getDiagnosticsEndpointMiddleware } from "./middlewares/diagnostics-endpoint-middleware";
import { getIndexHtmlMiddleware } from "./middlewares/index-html-middleware";
import {
  loadDataAppVirtualModule,
  resolveDataAppVirtualId,
} from "./virtual-modules";

export function dataAppSandboxDevPlugin(
  appSlug: string,
  allowedHosts: string[],
): Plugin {
  const diagnostics = new DiagnosticsStore();
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

      const refreshManifestStatus = () => {
        manifestStatus = validateDataAppManifest(root, allowedHosts);
      };

      refreshManifestStatus();

      server.middlewares.use(getAppBundleMiddleware(bundle));
      server.middlewares.use(
        getDiagnosticsEndpointMiddleware({
          store: diagnostics,
          getManifest: () => manifestStatus,
          getClients: () => server.ws.clients.size,
          getLastRebuildAt: () => bundle.lastRebuildAt,
        }),
      );

      server.ws.on(DATA_APP_DIAGNOSTICS_EVENT, (message) => {
        if (diagnostics.applyMessage(message)) {
          server.ws.send({
            type: "custom",
            event: DATA_APP_DIAGNOSTICS_CHANGED_EVENT,
          });
        }
      });

      const srcDir = `${path.sep}src${path.sep}`;

      server.watcher.on("all", async (_event, file) => {
        if (path.basename(file) === DATA_APP_MANIFEST_FILE_NAME) {
          refreshManifestStatus();

          server.ws.send({
            type: "custom",
            event: DATA_APP_DIAGNOSTICS_CHANGED_EVENT,
          });

          return;
        }

        if (file.includes(srcDir) && (await bundle.rebuild())) {
          server.ws.send({ type: "custom", event: DATA_APP_REBUILT_EVENT });
        }
      });

      await bundle.rebuild();

      return () => {
        server.middlewares.use(getIndexHtmlMiddleware(server));
      };
    },
  };
}
