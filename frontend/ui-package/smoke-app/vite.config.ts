import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// eslint-disable-next-line import/no-default-export -- Vite config
export default defineConfig({
  plugins: [react()],
});
