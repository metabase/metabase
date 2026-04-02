/* eslint-disable import/no-default-export */
import { resolve } from "path";

import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [
    dts({
      tsconfigPath: resolve(__dirname, "tsconfig.lib.json"),
    }),
  ],
  build: {
    target: "node20",
    outDir: "dist",
    lib: {
      entry: {
        cli: resolve(__dirname, "src/cli.ts"),
        index: resolve(__dirname, "src/index.ts"),
      },
      formats: ["es"],
    },
    rolldownOptions: {
      external: ["commander", "react", /^node:/],
    },
  },
});
