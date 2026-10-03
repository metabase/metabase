/* eslint-disable import/no-default-export */
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "path";

import ts from "typescript";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

const SANDBOX_SOURCE_FILES = [
  "distortions-blocked-apis.ts",
  "distortions-dom-mutate.ts",
  "distortions-event.ts",
];

const readSandboxSource = (file: string) => {
  const source = readFileSync(
    resolve(
      __dirname,
      "../../../../frontend/src/metabase/utils/scripts-sandbox",
      file,
    ),
    "utf-8",
  );
  return ts
    .createPrinter({ removeComments: true })
    .printFile(ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true));
};

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
    SANDBOX_SOURCE_FILES.forEach((file) => {
      writeFileSync(
        resolve(__dirname, "dist/skill/references", file),
        readSandboxSource(file),
      );
    });
    writeFileSync(
      resolve(__dirname, "dist/skill/references/blocklists.mjs"),
      readSandboxSource("blocklists.ts"),
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
        /^node:/,
      ],
    },
  },
});
