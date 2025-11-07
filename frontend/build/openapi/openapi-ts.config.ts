import { defineConfig } from "@hey-api/openapi-ts";

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  input: "./resources/openapi/openapi.json",
  output: {
    path: "frontend/src/metabase-types/openapi",
    clean: false,
  },
  types: {
    enums: "javascript", // This generates runtime enums!
  },
  plugins: [
    {
      enums: true,
      name: "@hey-api/typescript",
    },
  ],
});
