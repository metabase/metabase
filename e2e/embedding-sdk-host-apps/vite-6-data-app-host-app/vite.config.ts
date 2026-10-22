import { dataAppConfig } from "@metabase/embedding-sdk-react/data-app-dev/config";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");

  return dataAppConfig({
    port: Number(env.CLIENT_PORT) || 4400,
  });
});
