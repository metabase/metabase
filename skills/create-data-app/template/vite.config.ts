import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { type LibraryFormats, defineConfig, loadEnv } from "vite";
import {
  buildDevConnectSrcCsp,
  readAllowedHosts,
} from "./config/dev-connect-src";
import { findEnvRoot } from "./config/env-root";

const appRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const envDir = findEnvRoot(appRoot);
  const env = loadEnv(mode, envDir, "");

  const manifestPath = [
    path.join(appRoot, "data_app.yaml"),
    path.join(appRoot, "data_app.yml"),
  ].find((candidate) => fs.existsSync(candidate));
  const allowedHosts = manifestPath ? readAllowedHosts(manifestPath) : [];

  return {
    envDir,
    plugins: [react()],
    build: {
      outDir: "dist",
      emptyOutDir: true,
      lib: {
        entry: "src/index.tsx",
        formats: ["iife"] satisfies LibraryFormats[],
        fileName: () => "index.js",
        name: "__dataAppFactory__",
      },
      rollupOptions: {
        external: [
          "react",
          "react/jsx-runtime",
          "@metabase/embedding-sdk-react",
          "@metabase/embedding-sdk-react/data-app",
        ],
        output: {
          globals: {
            react: "React",
            "react/jsx-runtime": "__react_jsx_runtime__",
            "@metabase/embedding-sdk-react": "__metabase_sdk__",
            "@metabase/embedding-sdk-react/data-app": "__metabase_data_app__",
          },
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
          env.VITE_MB_URL,
        ),
      },
    },
  };
});
