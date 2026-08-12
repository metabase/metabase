/* eslint-env node */

const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "../../../..");

/**
 * Source directories that are free of import-time side effects: importing a file
 * from one of them and using none of its exports is guaranteed to be observable
 * only through those exports. Nothing here may contain a bare `import "./x"`, an
 * asset import, or a top-level call with observable effects. Pure top-level calls
 * are fine, and the module relies on them (`createContext`, `new Set`).
 *
 * A CSS import with a binding is allowed. `modules.auto` in `css-config.js` turns
 * every stylesheet outside `node_modules` into a scoped CSS module, so its rules
 * reach the page only through the class names it exports. Dropping the importer
 * drops exactly the rules that nothing could have referenced. A stylesheet that
 * escapes its scope (`:global`, `:root`, a bare element selector) breaks that, and
 * the spec below rejects one.
 *
 * Rspack assumes every module may have side effects unless told otherwise, so
 * without this it cannot shake a barrel: a file importing only `useLocation` from
 * `metabase/router` pulls in every module the barrel re-exports.
 *
 * Adding a directory here is a promise the bundler cannot verify. A violation
 * fails silently, in production only, by dropping code that was meant to run, so
 * `frontend/lint/tests/side-effect-free-modules.unit.spec.js` guards the
 * mechanically detectable half of the contract.
 *
 * Only applies to production builds, where `optimization.sideEffects` is on.
 */
const SIDE_EFFECT_FREE_PATHS = [
  // Trailing separator: rspack prefix-matches `include`, so a bare directory path
  // would also claim a sibling like `router-utils.ts` or a future `router-v8/`.
  path.join(REPO_ROOT, "frontend/src/metabase/router") + path.sep,
  path.join(REPO_ROOT, "frontend/src/metabase/ui") + path.sep,
];

/**
 * Files inside those directories that do have an import-time side effect, and so
 * keep rspack's default assumption that they must always run.
 */
const SIDE_EFFECT_FULL_FILES = [
  // Mutates the `Popover` object it imports from `@mantine/core` to swap in a
  // `Dropdown` that adds `PreventEagerPortal` and `OverlayStackItem`. Mantine's
  // Combobox, Menu, HoverCard and ColorInput render `Popover.Dropdown` off that
  // same shared object, so the patch is how they inherit the behaviour. Shaking
  // this file out would strip it from every one of them.
  path.join(
    REPO_ROOT,
    "frontend/src/metabase/ui/components/overlays/Popover/index.tsx",
  ),
];

const SIDE_EFFECT_FREE_RULE = {
  include: SIDE_EFFECT_FREE_PATHS,
  exclude: SIDE_EFFECT_FULL_FILES,
  sideEffects: false,
};

module.exports = {
  SIDE_EFFECT_FREE_PATHS,
  SIDE_EFFECT_FULL_FILES,
  SIDE_EFFECT_FREE_RULE,
};
