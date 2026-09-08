import { defineConfig } from "@hey-api/openapi-ts";

// eslint-disable-next-line import/no-default-export -- this library requires a default export
export default defineConfig({
  input: ".tmp/openapi/openapi.json",
  output: {
    path: ".tmp/openapi/types",
    entryFile: false,
    clean: true,
    // Keep recursive legacy MBQL declarations behind the existing skipLibCheck boundary.
    fileName: { suffix: ".gen.d" },
  },
  plugins: ["@hey-api/typescript"],
});
