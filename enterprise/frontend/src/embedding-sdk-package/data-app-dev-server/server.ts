import react from "@vitejs/plugin-react";
import {
  type ConfigEnv,
  type PluginOption,
  type UserConfig,
  loadEnv,
} from "vite";

import { dataAppBuildPlugins, dataAppLibBuild } from "./config/build-config";
import { buildConnectSrcCsp, readAllowedHosts } from "./config/dev-connect-src";
import { findEnvRoot } from "./config/find-env-root";
import { dataAppSandboxDevPlugin } from "./dev-plugin/plugin";

/**
 * Everything a Metabase data app needs, as a single Vite plugin — drop it into a
 * normal config:
 *
 * ```ts
 * import { defineConfig } from "vite";
 * import { dataAppVitePlugin } from "@metabase/embedding-sdk-react/data-app-dev/server";
 *
 * export default defineConfig({
 *   plugins: [dataAppVitePlugin()],
 *   server: { port: 5174 },
 * });
 * ```
 *
 * It bundles the React plugin, inlines imported CSS, runs `npm run dev` through
 * the real Near-Membrane sandbox (so dev behaves like production), and serves the
 * dev entry. The bundle contract — the IIFE entry/format + the React/SDK
 * externals/globals — is applied through its `config` hook, which Vite merges
 * *over* your config, so it can't be accidentally overridden. Returns an array of
 * plugins (Vite flattens nested plugin arrays).
 */
export function dataAppVitePlugin(): PluginOption[] {
  const appRoot = process.cwd();
  const envDir = findEnvRoot(appRoot);
  const allowedHosts = readAllowedHosts(appRoot);

  return [
    react(),
    ...dataAppBuildPlugins(),
    dataAppSandboxDevPlugin(allowedHosts),
    {
      name: "metabase-data-app",
      // Merged over the user's config (`mergeConfig(userConfig, this)`), so these
      // win — the bundle Metabase loads always matches what dev runs. `loadEnv`
      // needs the mode, which is only known here in the `config` hook.
      config: (_config: UserConfig, env: ConfigEnv) => ({
        envDir,
        build: {
          outDir: "dist",
          emptyOutDir: true,
          ...dataAppLibBuild("index.js"),
        },
        server: {
          host: "localhost",
          headers: {
            "Content-Security-Policy": buildConnectSrcCsp(
              allowedHosts,
              loadEnv(env.mode, envDir, "").VITE_MB_URL,
            ),
          },
        },
      }),
    },
  ];
}
