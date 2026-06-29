import { dataAppVitePlugin } from "@metabase/embedding-sdk-react/data-app-dev/server";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [dataAppVitePlugin({ mode })],
  server: { port: 5174 },
}));
