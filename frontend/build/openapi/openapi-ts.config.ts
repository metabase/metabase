import { defineConfig } from "@hey-api/openapi-ts";

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  input: "./resources/openapi/openapi.json", // or .yaml
  output: {
    path: "frontend/src/metabase-types/openapi",
    clean: false,
  },
  types: {
    enums: "javascript", // This generates runtime enums!
  },
  plugins: [
    {
      enums: true, // default
      name: "@hey-api/typescript",
    },
  ],
});
