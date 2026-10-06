/* eslint-disable import/no-default-export */
import { cpSync } from "node:fs";
import { resolve } from "path";

import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

const copyStaticFiles = () => ({
  name: "copy-static-files",
  closeBundle: () => {
    cpSync(
      resolve(__dirname, "src/templates"),
      resolve(__dirname, "dist/templates"),
      {
        recursive: true,
      },
    );
    cpSync(resolve(__dirname, "src/skill"), resolve(__dirname, "dist/skill"), {
      recursive: true,
    });
  },
});

export default defineConfig({
  plugins: [
    dts({
      tsconfigPath: resolve(__dirname, "tsconfig.lib.json"),
    }),
    copyStaticFiles(),
  ],
  build: {
    target: "node20",
    outDir: "dist",
    lib: {
      entry: {
        cli: resolve(__dirname, "src/cli.ts"),
        index: resolve(__dirname, "src/index.ts"),
        testing: resolve(__dirname, "src/testing/index.ts"),
      },
      formats: ["es"],
    },
    rolldownOptions: {
      external: [
        "commander",
        "tar-stream",
        "react",
        "react/jsx-runtime",
        "react-dom",
        "react-dom/client",
        "react-dom/test-utils",
        /^node:/,
      ],
    },
  },
});
