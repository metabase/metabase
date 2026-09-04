import { defineConfig } from "@hey-api/openapi-ts";

// eslint-disable-next-line import/no-default-export -- this library requires a default export
export default defineConfig({
  input: process.env.METABASE_OPENAPI_INPUT ?? "./.tmp/openapi/openapi.json",
  output: {
    entryFile: false,
    path:
      process.env.METABASE_OPENAPI_OUTPUT ??
      "frontend/src/metabase-types/openapi",
    // Declaration output is exempt from checking via `skipLibCheck`, which keeps the
    // circular legacy-MBQL aliases from failing tsc.
    fileName: { suffix: ".gen.d" },
    // Clean declaration files to avoid stale types
    clean: true,
    postProcess: ["prettier"],
  },
  plugins: ["@hey-api/typescript"],
});
