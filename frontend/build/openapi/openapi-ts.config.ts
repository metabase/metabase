import { defineConfig } from "@hey-api/openapi-ts";

import { GENERATED_TYPES_DIR, OPENAPI_SPEC_PATH } from "./paths";

// eslint-disable-next-line import/no-default-export -- this library requires a default export
export default defineConfig({
  input: OPENAPI_SPEC_PATH,
  output: {
    path: GENERATED_TYPES_DIR,
    entryFile: false,
    clean: true,
    fileName: { suffix: ".gen.d" },
  },
  plugins: ["@hey-api/typescript"],
});
