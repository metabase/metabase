import react from "@vitejs/plugin-react";
import { type PluginOption, loadEnv } from "vite";

import { dataAppBuildPlugins, dataAppLibBuild } from "./config/build-config";
import { buildConnectSrcCsp, readAllowedHosts } from "./config/dev-connect-src";
import { findEnvRoot } from "./config/find-env-root";
import { dataAppSandboxDevPlugin } from "./dev-plugin/plugin";

export interface DataAppVitePluginOptions {
  /** The Vite mode from `defineConfig(({ mode }) => …)`, used to load `.env`. */
  mode: string;
}

/**
 * Everything a Metabase data app needs, as a single Vite plugin — drop it into a
 * normal config:
 *
 * ```ts
 * import { defineConfig } from "vite";
 * import { dataAppVitePlugin } from "@metabase/embedding-sdk-react/data-app-dev/server";
 *
 * export default defineConfig(({ mode }) => ({
 *   plugins: [dataAppVitePlugin({ mode })],
 *   server: { port: 5174 },
 * }));
 * ```
 *
 * It bundles the React plugin, inlines imported CSS, runs `npm run dev` through
 * the real Near-Membrane sandbox (so dev behaves like production), and serves the
 * dev harness. The bundle contract — the IIFE entry/format + the React/SDK
 * externals/globals — is applied through its `config` hook, which Vite merges
 * *over* your config, so it can't be accidentally overridden. Returns an array of
 * plugins (Vite flattens nested plugin arrays).
 */
export function dataAppVitePlugin({
  mode,
}: DataAppVitePluginOptions): PluginOption[] {
  const appRoot = process.cwd();
  const envDir = findEnvRoot(appRoot);
  const env = loadEnv(mode, envDir, "");
  const allowedHosts = readAllowedHosts(appRoot);

  return [
    react(),
    ...dataAppBuildPlugins(),
    dataAppSandboxDevPlugin(allowedHosts),
    {
      name: "metabase-data-app",
      // Merged over the user's config (`mergeConfig(userConfig, this)`), so these
      // win — the bundle Metabase loads always matches what dev runs.
      config: () => ({
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
              env.VITE_MB_URL,
            ),
          },
        },
      }),
    },
  ];
}
