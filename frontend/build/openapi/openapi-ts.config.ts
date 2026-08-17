import { defineConfig } from "@hey-api/openapi-ts";

// eslint-disable-next-line import/no-default-export -- this library requires a default export
export default defineConfig({
  input: "./.tmp/openapi/openapi.json",
  output: {
    path: "frontend/src/metabase-types/openapi",
    // Declaration output is exempt from checking via `skipLibCheck`, which keeps the
    // circular legacy-MBQL aliases from failing tsc.
    fileName: { suffix: ".gen.d" },
    // Clean declaration files to avoid stale types
    clean: true,
    postProcess: ["prettier"],
  },
  plugins: ["@hey-api/typescript"],
});
