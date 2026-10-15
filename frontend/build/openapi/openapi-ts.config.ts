import { defineConfig } from "@hey-api/openapi-ts";

// eslint-disable-next-line import/no-default-export -- this library requires a default export
export default defineConfig({
  input: "./resources/openapi/openapi.json",
  output: {
    path: "frontend/src/metabase-types/openapi",
    clean: false,
    postProcess: ["prettier"],
  },
  parser: {
    filters: {
      schemas: {
        // MetabaseLegacyMbqlSchema has circular references that break TS type checking
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
