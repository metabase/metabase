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
 * Third-party imports are assumed self-contained: a package whose import-time work non-importers rely on
 * is listed in the registry's `packages` (frontend/lint/side-effect-files.json),
 * and a vendor with host-extending plugins gets a facade.
 *
 * Only applies to production builds, where `optimization.sideEffects` is on.
 */
const SIDE_EFFECT_FREE_PATHS = [
  // Trailing separator: rspack prefix-matches `include`, so a bare directory path
  // would also claim a sibling like `router-utils.ts` or a future `router-v8/`.
  path.join(REPO_ROOT, "frontend/src/metabase/router") + path.sep,
  // The expression language: its barrel re-exports the autocomplete sources and
  // the lezer tokenizer, so a picker importing only `getClauseDefinition` from it
  // would otherwise pull CodeMirror into the initial bundle.
  path.join(REPO_ROOT, "frontend/src/metabase/querying/expressions") + path.sep,
  path.join(REPO_ROOT, "frontend/src/metabase/ui") + path.sep,
];

/**
 * Paths inside a side-effect-free directory that do have an import-time effect,
 * so keep rspack's default (assume side effects) for them. An entry, and its
 * whole import graph, is kept in every bundle that reaches it, so the list
 * should stay short and every file entry should be a fix candidate.
 *
 * A directory entry (trailing separator, like SIDE_EFFECT_FREE_PATHS) covers every file under it.
 * List `<module>/api` here when a module is enrolled: those files register their endpoints on the shared Api at import,
 * so a bundle has to evaluate them even when it only reaches them by name.
 */
const SIDE_EFFECT_PATHS = [
  // The pratt parser tables are built by module-scope calls that mutate the exported NODE_TYPE objects.
  // Their results are unused, so a PURE annotation would let the minifier delete the setup.
  path.join(
    REPO_ROOT,
    "frontend/src/metabase/querying/expressions/pratt/syntax.ts",
  ),
  // Installs our wrapped dropdown on Mantine's own Popover object. Mantine's
  // Combobox, Menu, ColorInput and HoverCard render `Popover.Dropdown`
  // internally, so a bundle that never imports our `Popover` still depends on
  // the replacement having run. ThemeProvider bare-imports it.
  path.join(
    REPO_ROOT,
    "frontend/src/metabase/ui/components/overlays/Popover/register-popover-dropdown.ts",
  ),
];

const SIDE_EFFECT_FREE_RULE = {
  // Script files only. A CSS module imported for its class names is reachable
  // only through the script that imports it, so it is dropped with that script
  // and needs no flag of its own; leaving CSS at rspack's default also keeps a
  // stray `import "./x.css"` from being shaken should one slip past the lint.
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
