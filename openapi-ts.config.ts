import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  client: "@hey-api/client-fetch",
  input: "http://localhost:3000/api/docs/openapi.json", // or .yaml
  output: "ts-types/schema3.d.ts",
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
