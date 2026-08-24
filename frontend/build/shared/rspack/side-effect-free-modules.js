/* eslint-env node */

const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "../../../..");

// Directories whose files do nothing at import time except define their exports.
// Listing one here sets `sideEffects: false` for rspack, so unused files are dropped from production bundles, and enrols it in the `metabase/no-module-side-effects` lint. Nothing else is needed.
// A file in a listed directory that has to run at import goes in SIDE_EFFECT_PATHS.
// This is unrelated to route splitting (the `import()` calls in metabase/routes.tsx).
const SIDE_EFFECT_FREE_PATHS = [
  // Trailing separator: rspack prefix-matches `include`, so a bare directory path would also claim a sibling like `router-utils.ts`.
  path.join(REPO_ROOT, "frontend/src/metabase/router") + path.sep,
  path.join(REPO_ROOT, "frontend/src/metabase/querying/expressions") + path.sep,
  path.join(REPO_ROOT, "frontend/src/metabase/ui") + path.sep,
];

// Files inside a listed directory that run something at import: rspack keeps them, the lint skips them, and a bare import of one is allowed.
// A directory entry (trailing separator) covers every file under it.
const SIDE_EFFECT_PATHS = [
  // Module-scope calls fill in the exported NODE_TYPE objects.
  path.join(
    REPO_ROOT,
    "frontend/src/metabase/querying/expressions/pratt/syntax.ts",
  ),
  // Replaces `Popover.Dropdown` on Mantine's own Popover, which Combobox, Menu, ColorInput and HoverCard render internally.
  path.join(
    REPO_ROOT,
    "frontend/src/metabase/ui/components/overlays/Popover/register-popover-dropdown.ts",
  ),
];

const SIDE_EFFECT_FREE_RULE = {
  // Script files only, a CSS module is dropped with the script that imports it.
  test: /\.[jt]sx?$/,
  include: SIDE_EFFECT_FREE_PATHS,
  exclude: SIDE_EFFECT_PATHS,
  sideEffects: false,
};

module.exports = {
  SIDE_EFFECT_FREE_PATHS,
  SIDE_EFFECT_PATHS,
  SIDE_EFFECT_FREE_RULE,
};
