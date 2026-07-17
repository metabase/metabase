import { defineConfig } from "@hey-api/openapi-ts";

// eslint-disable-next-line import/no-default-export -- this library requires a default export
export default defineConfig({
  input: "./.tmp/openapi/openapi.json",
  output: {
    path: "frontend/src/metabase-types/openapi",
    clean: false,
    postProcess: ["prettier"],
  },
  parser: {
    filters: {
      schemas: {
        // MetabaseLegacyMbqlSchema has circular references that break TS type checking
        // NOTE: excluded schemas that are referenced by kept schemas get re-included by
        // hey-api; the @ts-nocheck banner added by add-ts-nocheck.ts covers those (see types:generate).
        // eslint-disable-next-line metabase/no-literal-metabase-strings -- this is not user facing text
        exclude: ["/^MetabaseLegacyMbqlSchema/"],
      },
    },
  },
  plugins: [
    {
      name: "@hey-api/typescript",
      enums: "javascript", // This generates runtime enums!
    },
  ],
});
