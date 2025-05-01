import path from "path";

import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const clientPort = parseInt(env.CLIENT_PORT, 10) || 4400;

  return {
    plugins: [react()],
    // To force CJS resolving for dependencies
    ...(process.env.BUNDLE_FORMAT === "cjs" && {
      resolve: {
        alias: [
          {
            find: "@metabase/embedding-sdk-react",
            replacement: path.resolve(
              __dirname,
              "node_modules/@metabase/embedding-sdk-react/dist/index.cjs",
            ),
          },
        ],
      },
    }),
    server: {
      strictPort: true,
      port: clientPort,
    },
    preview: { port: clientPort },
  };
});
