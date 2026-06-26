import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { type LibraryFormats, defineConfig, loadEnv } from "vite";
import {
  DATA_APP_ENTRY,
  DATA_APP_EXTERNALS,
  DATA_APP_FACTORY_GLOBAL,
  DATA_APP_GLOBALS,
} from "./config/data-app-bundle";
import {
  buildDevConnectSrcCsp,
  readAllowedHosts,
} from "./config/dev-connect-src";
import { findEnvRoot } from "./config/env-root";
import { dataAppSandboxDevPlugin } from "./config/sandbox-dev-plugin";

const appRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ command, mode }) => {
  const envDir = findEnvRoot(appRoot);
  const env = loadEnv(mode, envDir, "");

  const manifestPath = [
    path.join(appRoot, "data_app.yaml"),
    path.join(appRoot, "data_app.yml"),
  ].find((candidate) => fs.existsSync(candidate));
  const allowedHosts = manifestPath ? readAllowedHosts(manifestPath) : [];

  return {
    envDir,
    // use DATA_APP_ prefixed variables only for dev mode
    envPrefix: command === "serve" ? "DATA_APP_" : [],
    plugins: [react(), dataAppSandboxDevPlugin(allowedHosts)],
    build: {
      outDir: "dist",
      emptyOutDir: true,
      lib: {
        entry: DATA_APP_ENTRY,
        formats: ["iife"] satisfies LibraryFormats[],
        fileName: () => "index.js",
        name: DATA_APP_FACTORY_GLOBAL,
      },
      rollupOptions: {
        external: DATA_APP_EXTERNALS,
        output: {
          globals: DATA_APP_GLOBALS,
        },
      },
    },
    server: {
      port: 5174,
      host: "localhost",
      // Enforce the app's `allowed_hosts` in dev the same way Metabase does in
      // production (via CSP `connect-src`), so a fetch/XHR a sandboxed data app
      // couldn't make fails here too instead of only in Metabase.
      headers: {
        "Content-Security-Policy": buildDevConnectSrcCsp(
          allowedHosts,
          env.DATA_APP_MB_URL,
        ),
      },
    },
  };
});
