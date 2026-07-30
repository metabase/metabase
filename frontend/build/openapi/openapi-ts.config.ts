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
  parser: {
    filters: {
      schemas: {
        // hey-api still emits these when referenced — hence the .d.ts output above.
        // eslint-disable-next-line metabase/no-literal-metabase-strings -- this is not user facing text
        exclude: ["/^MetabaseLegacyMbqlSchema/"],
      },
    },
  },
  plugins: ["@hey-api/typescript"],
});
