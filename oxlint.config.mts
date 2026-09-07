import { defineConfig } from "oxlint";

import { createConfig } from "./frontend/lint/oxlint/config.mjs";

// Oxlint requires a default config export.
// eslint-disable-next-line import/no-default-export
export default defineConfig(createConfig());
