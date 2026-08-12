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
 * A bigger tree is not automatically a better candidate. Adding `metabase/ui` was
 * measured over two production builds: 69 kB less raw JS, but 11 kB more brotli,
 * because concatenating more modules trades compressible `__webpack_require__`
 * boilerplate for unique renamed identifiers. `app-main`, `app-embed` and
 * `app-public` each paid about 6 kB for wins of 1 kB to 4 kB on the narrower
 * entries. Measure both raw and compressed before adding a directory.
 *
 * Only applies to production builds, where `optimization.sideEffects` is on.
 */
const SIDE_EFFECT_FREE_PATHS = [
  // Trailing separator: rspack prefix-matches `include`, so a bare directory path
  // would also claim a sibling like `router-utils.ts` or a future `router-v8/`.
  path.join(REPO_ROOT, "frontend/src/metabase/router") + path.sep,
];

const SIDE_EFFECT_FREE_RULE = {
  include: SIDE_EFFECT_FREE_PATHS,
  sideEffects: false,
};

module.exports = { SIDE_EFFECT_FREE_PATHS, SIDE_EFFECT_FREE_RULE };
