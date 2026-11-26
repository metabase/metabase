import { rejects } from "node:assert/strict";
import { resolve } from "path";

import { build } from "vite";

import { repoRoot } from "./app-allowlist";

const theme = resolve(repoRoot, "frontend/src/metabase/ui/Theme.module.css");

await rejects(
  build({
    configFile: resolve(repoRoot, "frontend/ui-package/vite.config.ts"),
    logLevel: "silent",
    build: { write: false },
    plugins: [
      {
        name: "inject-css-import",
        enforce: "pre",
        transform(code, id) {
          if (id === theme) {
            return `@import "../css/core/float.module.css";\n${code}`;
          }
        },
      },
    ],
  }),
  /Theme\.module\.css: imports .*float\.module\.css, which is app code outside the package allowlist/,
);
