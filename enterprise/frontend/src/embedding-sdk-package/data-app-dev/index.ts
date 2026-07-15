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

/**
 * The contract plugin array used by {@link dataAppConfig}. It bundles the React
 * plugin, inlines imported CSS, adds SVG-as-component support, runs `npm run dev`
 * through the real Near-Membrane sandbox (so dev behaves like production), serves
 * the dev entry, and applies the bundle contract — the IIFE entry/format + the
 * React/SDK externals/globals — through a `config` hook that Vite merges *over*
 * the user's config, so it can't be accidentally overridden.
 *
 * Internal: apps configure through {@link dataAppConfig}, not this directly.
 */
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
      // Merged over the user's config (`mergeConfig(userConfig, this)`), so these
      // win — the bundle Metabase loads always matches what dev runs. `loadEnv`
      // needs the mode, which is only known here in the `config` hook.
      config: (_config: UserConfig, env: ConfigEnv): UserConfig => ({
        define: getDataAppDefine(env.mode),
        envDir,
        // Dev preview only — keeps `.env.local` secrets out of prod builds. See
        // `dataAppEnvPrefix`.
        envPrefix: dataAppEnvPrefix(env.command),
        // The dev plugin serves a synthetic index.html, so there's no file on
        // disk for Vite's default HTML/SPA middleware to find.
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

/** Default dev server port; override via `dataAppConfig({ port })`. */
const DEFAULT_DEV_PORT = 5174;

export interface DataAppConfigOverrides {
  /** Dev server port. Defaults to 5174. */
  port?: number;
}

/**
 * The complete Vite config for a Metabase data app — the only thing a template
 * `vite.config.ts` needs:
 *
 * ```ts
 * import { dataAppConfig } from "@metabase/embedding-sdk-react/data-app-dev/config";
 *
 * export default dataAppConfig();
 * ```
 *
 * `overrides` exposes only a curated set of knobs (currently just `port`, which
 * defaults to 5174). The contract plugin that enforces the bundle format +
 * sandbox is always applied and is intentionally NOT overridable, so a data app
 * can't drift from what Metabase loads.
 */
export function dataAppConfig({
  port = DEFAULT_DEV_PORT,
}: DataAppConfigOverrides = {}): UserConfig {
  return {
    plugins: [dataAppVitePlugin()],
    server: { port },
  };
}
