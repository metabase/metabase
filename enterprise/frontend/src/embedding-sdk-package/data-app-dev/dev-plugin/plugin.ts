import { randomUUID } from "node:crypto";
import path from "node:path";

import type { Plugin } from "vite";

import {
  ACTION_DEFINITIONS,
  QUERY_DEFINITIONS,
} from "../../data-app-resources/discover";
import { AgentRunner } from "../comments/agent-runner";
import { getCommentsFilePath } from "../comments/file";
import { CommentsStore } from "../comments/store";
import { validateDataAppManifest } from "../config/validate-manifest";
import { DATA_APP_REBUILT_EVENT } from "../constants/bundle";
import {
  DATA_APP_AGENT_CMD_ENV,
  DATA_APP_COMMENTS_CHANGED_EVENT,
  DATA_APP_COMMENTS_FILE_NAME,
} from "../constants/comments-channel";
import { DATA_APP_DIAGNOSTICS_CHANGED_EVENT } from "../constants/diagnostics-channel";
import { DATA_APP_MANIFEST_FILE_NAME } from "../constants/paths";

import { createAppBundle } from "./app-bundle";
import { DiagnosticsStore } from "./diagnostics-store";
import { getAppBundleMiddleware } from "./middlewares/app-bundle-middleware";
import { getCommentsEndpointMiddleware } from "./middlewares/comments-endpoint-middleware";
import { getDiagnosticsEndpointMiddleware } from "./middlewares/diagnostics-endpoint-middleware";
import { getIndexHtmlMiddleware } from "./middlewares/index-html-middleware";
import {
  loadDataAppVirtualModule,
  resolveDataAppVirtualId,
} from "./virtual-modules";

// `src/` imports the definitions from the root-level `queries/` and `actions/`,
// so the bundle is built from all three.
const BUNDLED_DIRECTORIES: readonly string[] = [
  "src",
  QUERY_DEFINITIONS.directory,
  ACTION_DEFINITIONS.directory,
];

const isBundledFile = (root: string, file: string) => {
  const [topDirectory] = path.relative(root, file).split(path.sep);

  return BUNDLED_DIRECTORIES.includes(topDirectory);
};

/** Read from the env dir's `.env.local`, like every other `DATA_APP_*` var. */
const readAgentCommand = (
  env: Record<string, unknown> | undefined,
): string | null => {
  const command = env?.[DATA_APP_AGENT_CMD_ENV];

  return typeof command === "string" && command.trim() !== ""
    ? command.trim()
    : null;
};

export function dataAppSandboxDevPlugin(
  appSlug: string,
  allowedHosts: string[],
): Plugin {
  const diagnostics = new DiagnosticsStore();
  // Served to the preview page alone (`virtual-modules.ts`), so a mutation
  // carrying it can only have come from the page.
  const devToken = randomUUID();

  return {
    name: "metabase-data-app-dev",
    apply: "serve",

    resolveId: (id) => resolveDataAppVirtualId(id),

    load: (id) =>
      loadDataAppVirtualModule(id, { appSlug, allowedHosts, devToken }),

    async configureServer(server) {
      const { root, mode } = server.config;

      const bundle = createAppBundle({
        root,
        mode,
        onError: (message) => server.config.logger.error(message),
      });

      const commentsFile = getCommentsFilePath(root);
      const comments = new CommentsStore(commentsFile);
      const notifyCommentsChanged = () =>
        server.ws.send({
          type: "custom",
          event: DATA_APP_COMMENTS_CHANGED_EVENT,
        });
      const agent = new AgentRunner({
        command: readAgentCommand(server.config.env),
        appRoot: root,
        onRunChange: (commentId, run) => {
          comments.setAgentRun(commentId, run);
          notifyCommentsChanged();
        },
      });

      server.httpServer?.on("close", () => agent.dispose());

      server.middlewares.use(getAppBundleMiddleware(bundle));
      server.middlewares.use(
        getCommentsEndpointMiddleware({
          store: comments,
          agent,
          devToken,
          getPromptContext: (request) => ({
            appSlug,
            appRoot: root,
            previewOrigin: request.headers.host
              ? `http://${request.headers.host}`
              : null,
          }),
          notifyChanged: notifyCommentsChanged,
        }),
      );
      server.middlewares.use(
        getDiagnosticsEndpointMiddleware({
          store: diagnostics,
          getManifest: () => validateDataAppManifest(root, allowedHosts),
          getClients: () => server.ws.clients.size,
          getLastRebuildAt: () => bundle.lastRebuildAt,
          getBuildId: () => bundle.buildId,
          notifyChanged: () =>
            server.ws.send({
              type: "custom",
              event: DATA_APP_DIAGNOSTICS_CHANGED_EVENT,
            }),
        }),
      );

      server.watcher.on("all", async (_event, file) => {
        // An agent may resolve or rewrite comments from the shell; the store
        // re-reads the file on its own, this only tells open pages to re-read.
        if (path.basename(file) === DATA_APP_COMMENTS_FILE_NAME) {
          notifyCommentsChanged();

          return;
        }

        if (path.basename(file) === DATA_APP_MANIFEST_FILE_NAME) {
          server.ws.send({
            type: "custom",
            event: DATA_APP_DIAGNOSTICS_CHANGED_EVENT,
          });

          return;
        }

        if (isBundledFile(root, file) && (await bundle.rebuild())) {
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
