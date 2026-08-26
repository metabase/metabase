/* eslint-env node */

const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "../../../..");

// Sets sideEffects: false for the listed paths, and enrols them in the metabase/no-module-side-effects lint.
// This is unrelated to route splitting (the `import()` calls in metabase/routes.tsx).
const SIDE_EFFECT_FREE_PATHS = [
  "frontend/src/metabase/router",
  "frontend/src/metabase/querying/expressions",
  "frontend/src/metabase/ui",
  // Trailing separator: rspack prefix-matches `include`, so a bare directory path would also claim a sibling like `router-utils.ts`.
].map((dir) => path.join(REPO_ROOT, dir) + path.sep);

// Exceptions to the above rule, which are known to have side effects and must be included in the bundle.
const SIDE_EFFECT_PATHS = [
  // Module-scope calls fill in the exported NODE_TYPE objects.
  "frontend/src/metabase/querying/expressions/pratt/syntax.ts",
  // Replaces `Popover.Dropdown` on Mantine's own Popover, which Combobox, Menu, ColorInput and HoverCard render internally.
  "frontend/src/metabase/ui/components/overlays/Popover/register-popover-dropdown.ts",
].map((file) => path.join(REPO_ROOT, file));

// Only script files are ever marked side-effect free.
// CSS and other asset imports exist for their effect, so they keep the bundler's default.
const SCRIPT_FILE_PATTERN = /\.[jt]sx?$/;

const SIDE_EFFECT_FREE_RULE = {
  test: SCRIPT_FILE_PATTERN,
  include: SIDE_EFFECT_FREE_PATHS,
  exclude: SIDE_EFFECT_PATHS,
  sideEffects: false,
};

module.exports = {
  SCRIPT_FILE_PATTERN,
  SIDE_EFFECT_FREE_PATHS,
  SIDE_EFFECT_PATHS,
  SIDE_EFFECT_FREE_RULE,
};
