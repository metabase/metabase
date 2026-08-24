/* eslint-env node */

const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "../../../..");

/**
 * Directories whose files do nothing at import time except define their exports.
 *
 * Listing a directory here does two things, and nothing else is needed:
 *   - rspack builds it with `sideEffects: false`, so a production bundle drops any file in it whose exports go unused.
 *     That is what lets a barrel be tree-shaken: importing only `useLocation` from `metabase/router` does not pull in every file the barrel re-exports.
 *   - eslint.config.mjs runs `metabase/no-module-side-effects` on every file in it, reporting the import-time work it can see.
 *
 * This is separate from route splitting, the `import()` calls in metabase/routes.tsx.
 * Route splitting decides which chunk a file lands in, this decides whether an unused file is included at all.
 * Adding a file to a split route, or adding a new split route, needs nothing here.
 *
 * The lint exists because the bundler cannot check the promise.
 * A file that registers an endpoint or patches a global at import is dropped like any other, and that work is silently lost, in production only.
 * A file inside a listed directory that has to run at import goes in SIDE_EFFECT_PATHS below.
 *
 * Third-party packages are assumed to do nothing at import that other code relies on.
 * The ones that do are listed under `packages` in frontend/lint/side-effect-files.json.
 *
 * Only production builds are affected, where `optimization.sideEffects` is on.
 */
const SIDE_EFFECT_FREE_PATHS = [
  // Trailing separator: rspack prefix-matches `include`, so a bare directory path would also claim a sibling like `router-utils.ts`.
  path.join(REPO_ROOT, "frontend/src/metabase/router") + path.sep,
  // The expression language barrel re-exports the autocomplete sources and the lezer tokenizer,
  // so a picker importing only `getClauseDefinition` from it would otherwise pull CodeMirror into the initial bundle.
  path.join(REPO_ROOT, "frontend/src/metabase/querying/expressions") + path.sep,
  path.join(REPO_ROOT, "frontend/src/metabase/ui") + path.sep,
];

/**
 * Files inside a listed directory that do run something at import.
 * Rspack keeps its default (assume side effects) for them, the lint skips them, and a bare import of one of them is allowed.
 * Each entry, and everything it imports, is kept in every bundle that reaches it, so the list should stay short.
 *
 * A directory entry (trailing separator) covers every file under it.
 * A module's `api` files register their endpoints on the shared Api at import, so list `<module>/api/` here when enrolling a module.
 */
const SIDE_EFFECT_PATHS = [
  // The pratt parser tables are built by module-scope calls that change the exported NODE_TYPE objects.
  // Their results are unused, so a PURE annotation would let the minifier delete the setup.
  path.join(
    REPO_ROOT,
    "frontend/src/metabase/querying/expressions/pratt/syntax.ts",
  ),
  // Installs our wrapped dropdown on Mantine's own Popover object.
  // Mantine's Combobox, Menu, ColorInput and HoverCard render `Popover.Dropdown` internally,
  // so a bundle that never imports our `Popover` still relies on the replacement having run.
  // ThemeProvider bare-imports it.
  path.join(
    REPO_ROOT,
    "frontend/src/metabase/ui/components/overlays/Popover/register-popover-dropdown.ts",
  ),
];

const SIDE_EFFECT_FREE_RULE = {
  // Script files only.
  // A CSS module is reachable only through the script that imports it, so it is dropped with that script and needs no flag of its own.
  // Leaving CSS at rspack's default also keeps a stray `import "./x.css"` from being shaken should one slip past the lint.
  test: /\.[jt]sx?$/,
  include: SIDE_EFFECT_FREE_PATHS,
  // Prefix-matched like `include`, so a directory entry excludes its whole tree.
  exclude: SIDE_EFFECT_PATHS,
  sideEffects: false,
};

module.exports = {
  SIDE_EFFECT_FREE_PATHS,
  SIDE_EFFECT_PATHS,
  SIDE_EFFECT_FREE_RULE,
};
