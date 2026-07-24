#!/usr/bin/env node
// Generates `.oxlintrc.boundaries.json` from `.oxlintrc.json` plus the module
// boundary graph in `frontend/lint/module-boundaries.mjs`.
//
// The boundaries pass needs its own oxlint config because `eslint-plugin-boundaries`
// is a JS plugin that oxlint runs single-threaded, so evaluating its rules across the
// whole tree is an order of magnitude slower than the native Rust rules. Import
// resolution is not the cost: oxlint resolves natively (the `import` plugin plus an
// `import/*` rule enable multi-file analysis, and the boundaries plugin reuses those
// resolutions). It is a full copy of `.oxlintrc.json` rather than an `extends` of it
// because oxlint's `extends` does not inherit `ignorePatterns`.
//
// The graph has to be inlined (JSON cannot import JS), so the copy can go stale —
// it already did once, silently, after a rebase pulled in new modules. Generating
// it on every run removes that failure mode.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { elements, enforcedRules } from "../frontend/lint/module-boundaries.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(
  fs.readFileSync(path.join(root, ".oxlintrc.json"), "utf8"),
);

config.jsPlugins = [...new Set([...(config.jsPlugins ?? []), "eslint-plugin-boundaries"])];
config.settings = {
  ...config.settings,
  "boundaries/elements": elements,
  "boundaries/ignore": ["**/e2e/**", "test/**"],
};
// custom-viz carries its own (empty) .oxlintrc.json, so the parent config does not
// apply there. Passing `-c` bypasses nested-config discovery, so mirror it here.
config.ignorePatterns = [
  ...new Set([...(config.ignorePatterns ?? []), "enterprise/frontend/src/custom-viz/**"]),
];
config.overrides = [
  ...config.overrides,
  {
    files: [
      "frontend/src/**/*.{js,jsx,ts,tsx}",
      "enterprise/frontend/src/**/*.{js,jsx,ts,tsx}",
    ],
    rules: {
      "boundaries/element-types": ["error", { default: "disallow", rules: enforcedRules }],
      "boundaries/no-unknown-files": "error",
    },
  },
];

fs.writeFileSync(
  path.join(root, ".oxlintrc.boundaries.json"),
  JSON.stringify(config, null, 2) + "\n",
);
console.log(
  `.oxlintrc.boundaries.json: ${elements.length} elements, ${enforcedRules.length} rules`,
);
