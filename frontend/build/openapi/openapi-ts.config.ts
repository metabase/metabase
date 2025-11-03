import { defineConfig } from "@hey-api/openapi-ts";

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  input: "./ts-types/openapi.json", // or .yaml
  output: "frontend/src/metabase-types/openapi",
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
