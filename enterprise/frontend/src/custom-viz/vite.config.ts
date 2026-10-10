/* eslint-disable import/no-default-export */
import { cpSync } from "node:fs";
import { resolve } from "path";

import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

const STATIC_FILES = [
  "templates/.claude",
  "templates/AGENTS.md",
  "templates/dev-server-landing.html",
  "skill",
];

const copyStaticFiles = () => ({
  name: "copy-static-files",
  closeBundle: () => {
    STATIC_FILES.forEach((path) =>
      cpSync(
        resolve(__dirname, "src", path),
        resolve(__dirname, "dist", path),
        {
          recursive: true,
        },
      ),
    );
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
