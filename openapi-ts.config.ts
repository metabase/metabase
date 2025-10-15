import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  client: "@hey-api/client-fetch",
  input: "ts-types//openapi.json", // or .yaml
  output: "ts-types/hey-api",
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
