import path from "node:path";

import react from "@vitejs/plugin-react";
import {
  type ConfigEnv,
  type PluginOption,
  type UserConfig,
  loadEnv,
} from "vite";

import { dataAppBuildPlugins, dataAppLibBuild } from "./config/build-config";
import { getDataAppDefine } from "./config/define";
import { buildDevCsp } from "./config/dev-connect-src";
import { dataAppEnvPrefix } from "./config/env-prefix";
import { findEnvRoot } from "./config/find-env-root";
import { readManifest } from "./config/read-manifest";
import { dataAppSandboxDevPlugin } from "./dev-plugin/plugin";

function dataAppVitePlugin(): PluginOption[] {
  const appRoot = process.cwd();
  const envDir = findEnvRoot(appRoot);

  const manifestResult = readManifest(appRoot);

  if (!manifestResult) {
    throw new Error(
      `No data_app.yaml found in ${appRoot}. Run vite from the data app's own ` +
        `directory (data_apps/<slug>/).`,
    );
  }

  const appSlug = path.basename(appRoot);
  const allowedHosts = manifestResult.manifest.allowed_hosts ?? [];

  return [
    react(),
    ...dataAppBuildPlugins(),
    dataAppSandboxDevPlugin(appSlug, allowedHosts),
    {
      name: "metabase-data-app",
      // Merged over the user's config, so these win — the bundle Metabase loads
      // always matches what dev runs.
      config: (_config: UserConfig, env: ConfigEnv): UserConfig => ({
        define: getDataAppDefine(env.mode),
        envDir,
        envPrefix: dataAppEnvPrefix(env.command),
        // The dev plugin serves a synthetic index.html; there's no file on disk.
        appType: "custom",
        build: {
          outDir: "dist",
          emptyOutDir: true,
          ...dataAppLibBuild("index.js"),
        },
        server: {
          host: "localhost",
          headers: {
            "Content-Security-Policy": buildDevCsp(
              allowedHosts,
              loadEnv(env.mode, envDir, "").DATA_APP_MB_URL,
            ),
          },
        },
      }),
    },
  ];
}

const DEFAULT_DEV_PORT = 5174;

export interface DataAppConfigOverrides {
  port?: number;
}

export function dataAppConfig({
  port = DEFAULT_DEV_PORT,
}: DataAppConfigOverrides = {}): UserConfig {
  return {
    plugins: [dataAppVitePlugin()],
    server: { port },
  };
}
