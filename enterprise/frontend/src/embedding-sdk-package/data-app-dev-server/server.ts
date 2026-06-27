import react from "@vitejs/plugin-react";
import {
  type ConfigEnv,
  type UserConfig,
  type UserConfigFnObject,
  defineConfig,
  loadEnv,
  mergeConfig,
} from "vite";

import { dataAppBuildPlugins, dataAppLibBuild } from "./config/build-config";
import { buildConnectSrcCsp, readAllowedHosts } from "./config/dev-connect-src";
import { findEnvRoot } from "./config/find-env-root";
import { dataAppSandboxDevPlugin } from "./dev-plugin/plugin";

export type DataAppViteOverrides =
  | UserConfig
  | ((env: ConfigEnv) => UserConfig);

/**
 * The entire Vite config for a Metabase data app — `vite.config.ts` is just:
 *
 * ```ts
 * import { dataAppVite } from "@metabase/embedding-sdk-react/data-app-dev/server";
 * export default dataAppVite();
 * ```
 *
 * `npm run dev` runs the app through the real Near-Membrane sandbox (so dev
 * behaves like production) and `npm run build` emits the single production IIFE.
 *
 * Pass `overrides` (an object or a `(env) => config` function) to extend it; they
 * are deep-merged via Vite's `mergeConfig` (extra plugins/aliases/server options,
 * etc.). The sandbox contract — the IIFE entry/format and the React/SDK
 * externals+globals — is re-locked after the merge and cannot be overridden, so
 * the bundle Metabase loads always matches what dev runs.
 */
export function dataAppVite(
  overrides: DataAppViteOverrides = {},
): UserConfigFnObject {
  return defineConfig((env) => {
    const appRoot = process.cwd();
    const envDir = findEnvRoot(appRoot);
    const loadedEnv = loadEnv(env.mode, envDir, "");
    const allowedHosts = readAllowedHosts(appRoot);

    const base: UserConfig = {
      envDir,
      plugins: [
        react(),
        ...dataAppBuildPlugins(),
        dataAppSandboxDevPlugin(allowedHosts),
      ],
      build: { outDir: "dist", emptyOutDir: true },
      server: {
        port: 5174,
        host: "localhost",
        headers: {
          "Content-Security-Policy": buildConnectSrcCsp(
            allowedHosts,
            loadedEnv.VITE_MB_URL,
          ),
        },
      },
    };

    const extra = typeof overrides === "function" ? overrides(env) : overrides;
    const merged: UserConfig = mergeConfig(base, extra);

    // Re-assert the non-negotiable sandbox contract on top of the merge, so a
    // consumer override can't change what the bundle is or how it's externalized.
    merged.build = {
      ...merged.build,
      ...dataAppLibBuild("index.js"),
    };

    return merged;
  });
}
