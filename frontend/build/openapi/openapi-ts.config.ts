import { defineConfig } from "@hey-api/openapi-ts";

// eslint-disable-next-line import/no-default-export -- this library requires a default export
export default defineConfig({
  input: "./resources/openapi/openapi.json",
  output: {
    path: "frontend/src/metabase-types/openapi",
    clean: false,
    format: "prettier",
  },
  parser: {
    filters: {
      schemas: {
        // MetabaseLegacyMbqlSchema has circular references that break TS type checking
        // eslint-disable-next-line no-literal-metabase-strings -- this is not user facing text
        exclude: ["/^MetabaseLegacyMbqlSchema/"],
      },
    },
  },
  plugins: [
    {
      enums: true,
      name: "@hey-api/typescript",
    },
  ],
});
