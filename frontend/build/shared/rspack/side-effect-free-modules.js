/* eslint-env node */

const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "../../../..");

/**
 * Source directories that are free of import-time side effects: importing a file
 * from one of them and using none of its exports is guaranteed to be observable
 * only through those exports. Nothing here may contain a bare `import "./x"`, a
 * CSS or asset import, or a top-level statement that calls something.
 *
 * Rspack assumes every module may have side effects unless told otherwise, so
 * without this it cannot shake a barrel: a file importing only `useLocation` from
 * `metabase/router` pulls in every module the barrel re-exports.
 *
 * Only applies to production builds, where `optimization.sideEffects` is on.
 */
const SIDE_EFFECT_FREE_PATHS = [
  path.join(REPO_ROOT, "frontend/src/metabase/router"),
];

const SIDE_EFFECT_FREE_RULE = {
  include: SIDE_EFFECT_FREE_PATHS,
  sideEffects: false,
};

module.exports = { SIDE_EFFECT_FREE_PATHS, SIDE_EFFECT_FREE_RULE };
