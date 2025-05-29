import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const clientPort = parseInt(env.CLIENT_PORT, 10) || 4400;

  return {
    plugins: [react()],
    server: {
      strictPort: true,
      port: clientPort,
    },
    preview: { port: clientPort },
  };
});
