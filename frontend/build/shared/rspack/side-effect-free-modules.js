/* eslint-env node */

const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "../../../..");

/**
 * Source directories that are free of import-time side effects: importing a file
 * from one of them and using none of its exports is guaranteed to be observable
 * only through those exports. Nothing here may contain a bare `import "./x"`, a
 * CSS or asset import, or a top-level call with observable effects. Pure top-level
 * calls are fine, and the module relies on them (`createContext`, `new Set`).
 *
 * Rspack assumes every module may have side effects unless told otherwise, so
 * without this it cannot shake a barrel: a file importing only `useLocation` from
 * `metabase/router` pulls in every module the barrel re-exports.
 *
 * Adding a directory here is a promise the bundler cannot verify. A violation
 * fails silently, in production only, by dropping code that was meant to run, so
 * the `metabase/no-module-side-effects` lint rule is applied to every directory
 * listed here (see eslint.config.mjs) and reports the import-time work it can see.
 *
 * Only applies to production builds, where `optimization.sideEffects` is on.
 */
const SIDE_EFFECT_FREE_PATHS = [
  // Trailing separator: rspack prefix-matches `include`, so a bare directory path
  // would also claim a sibling like `router-utils.ts` or a future `router-v8/`.
  path.join(REPO_ROOT, "frontend/src/metabase/router") + path.sep,
];

/**
 * Paths inside a side-effect-free directory that do have an import-time effect,
 * so keep rspack's default (assume side effects) for them. An entry, and its
 * whole import graph, is kept in every bundle that reaches it, so the list
 * should stay short and every file entry should be a fix candidate.
 *
 * A directory entry (trailing separator, like SIDE_EFFECT_FREE_PATHS) covers
 * every file under it. When a module with an `api/` folder is enrolled, list
 * `<module>/api` here: RTK endpoint injection at import is the endpoint
 * ownership pattern (D3), and it must never be tree-shaken away.
 */
const SIDE_EFFECT_PATHS = [];

const SIDE_EFFECT_FREE_RULE = {
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
