import fs from "node:fs";
import path from "node:path";

import react from "@vitejs/plugin-react";
import { load as parseYaml } from "js-yaml";
import {
  type ConfigEnv,
  type UserConfig,
  type UserConfigFnObject,
  defineConfig,
  loadEnv,
  mergeConfig,
} from "vite";

import {
  dataAppBuildPlugins,
  dataAppLibBuild,
} from "./data-app-dev-server/build-config";
import { dataAppSandboxDevPlugin } from "./data-app-dev-server/dev-plugin";

// How many parent dirs above the app to search for `.env.local`. Covers the
// deepest supported layout where the app is synced into a parent repo as
// `<repo>/data_apps/<app>` (2 levels deep). `.git` is a hard stop — `.env.local`
// lives at the repo root, so we never search above it.
const MAX_ENV_SEARCH_DEPTH = 2;

function findEnvRoot(start: string): string {
  let dir = start;
  for (let i = 0; i <= MAX_ENV_SEARCH_DEPTH; i++) {
    if (
      fs.existsSync(path.join(dir, ".env.local")) ||
      fs.existsSync(path.join(dir, ".git"))
    ) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return start;
}

/** Read `allowed_hosts` from the app's `data_app.yml`/`.yaml`; `[]` when absent. */
function readAllowedHosts(appRoot: string): string[] {
  const manifestPath = [
    path.join(appRoot, "data_app.yaml"),
    path.join(appRoot, "data_app.yml"),
  ].find((candidate) => fs.existsSync(candidate));
  if (!manifestPath) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    return [];
  }
  const hosts =
    typeof parsed === "object" && parsed !== null
      ? (parsed as { allowed_hosts?: unknown }).allowed_hosts
      : undefined;
  return Array.isArray(hosts)
    ? hosts.filter((host): host is string => typeof host === "string")
    : [];
}

function toOrigin(url: string | undefined): string | undefined {
  try {
    return url ? new URL(url).origin : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Dev-server CSP `connect-src` mirroring what Metabase emits for a data app in
 * production: the app may reach its `allowed_hosts` (plus the Metabase instance,
 * for the SDK's own calls) and the Vite dev server / HMR websocket — nothing
 * else. So a `fetch`/XHR a production data app couldn't make is blocked in
 * `npm run dev` too, instead of silently working locally.
 */
function buildConnectSrcCsp(
  allowedHosts: string[],
  metabaseUrl: string | undefined,
): string {
  const instanceOrigin = toOrigin(metabaseUrl);
  const sources = [
    "'self'",
    "ws://localhost:*",
    "wss://localhost:*",
    "ws://127.0.0.1:*",
    "wss://127.0.0.1:*",
    ...(instanceOrigin ? [instanceOrigin] : []),
    ...allowedHosts,
  ];
  return `connect-src ${sources.join(" ")}`;
}

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
