---
name: fe-modularization
description: Deciding where frontend code lives — tier model, move mechanics, extension points, side effects, naming, and the traps. Use when moving code between modules, carving new modules, fixing boundary violations, adding a barrel or an endpoint, or reviewing module-shape decisions.
---

# Frontend modularization

The module is the unit of blast radius: dependency direction, test selection,
bundle cones, and review scope all follow module boundaries. Every decision
here serves one goal: **make the file locations tell the truth about who owns
what and who may depend on whom.**

## Hard rules (check these before anything else)

- NEVER add an `export … from` re-export at an old path, and NEVER `export *`
  from a barrel. Move the code, codemod every call site, delete the old path,
  all in the same PR.
- NEVER import past a module's `index.ts` when that module has
  `enforcePublicApi: true`, and never past `metabase/ui`'s index at all. If
  the barrel is heavy, the fix is making the module side-effect free (below),
  not a deep import.
- NEVER rewrite a consumer to a lower-level idiom to make the linter pass. If
  the fix makes the consumer worse, the plan is wrong.
- NEVER give a new module `enforceSharedTiers: false`; new modules ship
  enforced with `enforcePublicApi: true` and an explicit `index.ts`.
- NEVER move code without the consumer-tier check (procedure step 2).
- ALWAYS delete a module's `enforceSharedTiers: false` line in the PR that
  takes it to zero violations.
- ALWAYS measure `bun run module-boundaries` before and after, and report the
  numbers.
- ALWAYS import `dayjs` from `metabase/dayjs`, routing from `metabase/router`,
  Mantine from `metabase/ui`, react-redux hooks from `metabase/redux`; the
  raw specifiers are lint-forbidden.

## Files that are ground truth

| what | where |
|---|---|
| module elements, tiers, `enforceSharedTiers`, `enforcePublicApi` | `frontend/lint/module-boundaries.mjs` |
| shared sub-tiers and levels, cluster rules | `frontend/lint/shared-tiers.mjs` |
| standalone boundaries lint (all violations, incl. grandfathered) | `bun run module-boundaries` (config `eslint.config.module-boundaries.mjs`) |
| PR lint (only enforced modules fail CI) | `bun run lint-eslint-pure` |
| side-effect-free directories and their exceptions | `frontend/build/shared/rspack/side-effect-free-modules.js` (`SIDE_EFFECT_FREE_PATHS`, `SIDE_EFFECT_PATHS`) |
| the lint rules that enforce that promise | `metabase/no-module-side-effects`, `metabase/no-base-api-access` in `frontend/lint/eslint-plugin-metabase/rules/` |
| public-api enforcement | `metabase/enforce-module-public-api` rule, driven by `getPublicApiModules()` |

## The model

Tiers: `lib < basic < shared < feature < app`. Imports point downward, never
sideways at feature tier (features may not import features; app and EE may
import anything). The shared tier is subdivided in `shared-tiers.mjs` into
shared-utils (U0…), shared-platform (P0…), and shared-domain, each ordered
into levels. A module imports only *strictly lower* levels of its sub-tier
plus the sub-tiers below; same-level peers are deliberately forbidden, which
is what makes cycles structurally impossible. A domain may hold two seats
when consumers demand it: a low core and a high surface (metabase-lib below
questions below query_builder; viz-core below visualizations).

Enforcement is per module: `enforceSharedTiers: false` on an element exempts
it from the level rules (counted by `bun run module-boundaries`, invisible to
PR lint). Modules with `enforcePublicApi: true` may only be imported from
outside via `metabase/<module>`, and import relatively inside.

## Deciding where code lives (apply in order; first decisive test wins)

1. **Who owns the concept?** Code lives with the module that owns its
   concept, not the module that renders or calls it. A mode encoding dashboard
   click behaviour is dashboard code even if viz executes it. Metabot
   conversation state is metabot state even though the store registers it.
2. **Consumer-tier check.** The destination must sit at or below the file's
   *lowest* consumer. A single consumer below the proposed home vetoes the
   move; report it, don't force it.
3. **Only four legitimate fixes** for a bad edge: move the code to its
   terminal home; invert through a designed extension point (a prop, an
   injected component, a contract type owned by the socket); fix the tier
   placement when the declared level is wrong; delete a thin wrapper (a rename
   with no derivation isn't an abstraction — deleting it *is* the migration).
4. **A bridge lives above the lower endpoint.** Code that needs both sides of
   a boundary belongs in or above the higher module.
5. **"Genuinely shared" is proven by consumers.** A shared address needs two
   or more consumers the tier rules can't serve another way. One consumer
   pretending to be shared is a feature module at the wrong address.

## Extension points

The socket's owner defines the contract; every plug lives with its extender.
Visualization owns the `mode` prop and click interfaces, each surface supplies
its mode; the editor owns its extension contract, metabot supplies tiptap
extensions; querying owns `TemplateTagsSidebarProps`, parameters implements
it.

- Prefer plain props/injection at composition sites. `PLUGIN_*` registries are
  for edition gating; single-reader slots move out to their reading module;
  slots with many readers live in the module that owns the concept (every
  slot the whitelabel plugin fills lives in `whitelabel`), tier permitting.
  Keep contracts type-light so implementations can load lazily.
- Identical injection at every callsite is acceptable until a fourth consumer
  or second slot appears; then the composition deserves its own module above
  both parts. Don't pre-build the wrapper.

## Store shape

A module that has redux state owns it:

- `store/` is private: reducer, plain creators/action types, and selectors,
  typed against the module's own state (`QueryBuilderStoreState`), never the
  global `State`. Thunks live in `actions/` and import `store/`, never the
  reverse.
- The barrel is the state API: selectors for reads, creators/thunks for
  writes.
- Store roots (`reducers-main`, `reducers-public`, the SDK store) import each
  slice from its module barrel and derive their own state type; no slice
  registry, no `declare module` merging.
- Cross-module writes: a callback prop when a composition point exists;
  otherwise dispatch the owner's exported creator; an event only when the
  emitter must not know its listeners. Raw `dispatch({ type: "…" })` strings
  are banned. A reducer or listener matching another module's *internal*
  action is the coupling to remove.
- Slices that mirror one endpoint get deleted (the RTK cache is the state); a
  fold over many sources with one writer (the metadata store) is kept as a
  module-private slice behind the barrel.

## Endpoints

Endpoints migrate to their owning module via `Api.injectEndpoints` from the
module's `api/` file (settings, metabot, transforms precedents); `metabase/api`
trends toward the client only. There is one `Api` object per backend because
tag invalidation only works within one instance. Consumers reach endpoints
only through the owner's exports (`useGetCardQuery`, `cardApi.endpoints.…`),
never by name through the base object; `metabase/no-base-api-access` allows
injection only in `metabase/api` and `**/api/**` / `**/api.ts`, and reaching by
name only in `metabase/api` and test support (`invalidateTags` /
`resetApiState` are fine anywhere). Each endpoint move carries its
metadata-store hookup: the owner calls `entitiesFetched` from its own
`onQueryStarted`.

## Import-time side effects

Directories in `SIDE_EFFECT_FREE_PATHS` are marked `sideEffects: false` for
rspack, so importing one export from their barrel no longer drags the whole
barrel into a bundle. The price: nothing in those directories may do work at
import time, or production silently drops it. `metabase/no-module-side-effects`
enforces this over every listed directory (module-scope calls, writes to
imported objects or globals, bare imports, control flow at import; escape
hatches are `/* #__PURE__ */` and the rule's pure-callee list). Files that
must run at import are listed in `SIDE_EFFECT_PATHS` (files or directories).

- **A library the app configures gets a facade module** owning the vendor
  import, the registrations, and the types, with the raw specifier
  lint-forbidden outside it: `metabase/router`, `metabase/ui`,
  `metabase/redux`, `metabase/dayjs`. Facades are the effect, so they never
  enter `SIDE_EFFECT_FREE_PATHS`. Never re-register a vendor plugin locally
  (`dayjs.extend`, `echarts` `use`).
- **A patch a component needs is an explicit registration module,
  bare-imported by the provider that needs it** and listed in
  `SIDE_EFFECT_PATHS` (Mantine's `Popover.Dropdown` replacement, imported by
  `ThemeProvider`).
- **Effects with no value to import** (global CSS, polyfills, the CSP nonce,
  EE plugin bootstrap) live in the entry's side-effects file and nowhere else.
- **Registries are filled from the composition root at boot**
  (`initializePlugins`, `registerVisualizations`), never by a module
  registering itself at import.
- **RTK injection stays at import**; when a module with an `api/` folder is
  declared side-effect free, list `<module>/api/` in `SIDE_EFFECT_PATHS`.

## Naming

The feature keeps the plain product-surface name; a shared carve is named for
what the shared part actually is: the concept when the concept is the shared
thing (`settings`, `current-user`, `whitelabel`, `dayjs`), or a qualified
capability when the plain noun is taken (`search-ui`, `metrics-ui`,
`viz-core`, `data-studio-ui`). Never two modules distinguished only by tier
prefix; never generic `-shared` / `-feature` suffixes.

## Procedure for a move

1. **Enumerate consumers honestly** (hook-name greps miss the last three):
   ```
   grep -rn "metabase/<module>" frontend/src enterprise/frontend/src frontend/test e2e
   grep -rn "jest.mock(\"metabase/<module>" frontend enterprise/frontend
   grep -rn "addMatcher(.*<endpoint>" frontend/src enterprise/frontend/src
   ```
   plus sibling files importing the moved file relatively. Classify each by
   module and tier from `module-boundaries.mjs` / `shared-tiers.mjs`.
2. **Consumer-tier check**: destination at or below the lowest consumer. If
   not, stop and report the blocking consumer.
3. **Measure before**: `bun run module-boundaries 2>&1 | tail -1` on the base
   (write the number down).
4. **Move**: `git mv`; codemod every importer to `metabase/<module>` (outside)
   or a relative path (inside); add named exports to the destination barrel
   for every symbol an outside consumer needs (each must have a real
   consumer). Delete the old path. If the module didn't exist: add its element
   in `module-boundaries.mjs` (ordered before any element it's carved from,
   first match wins), its level in `shared-tiers.mjs`, `enforcePublicApi:
   true`, an `index.ts`. If the move empties a module's violations, delete
   its `enforceSharedTiers: false` line. If the module has an `api/` folder
   and is side-effect free, list `<module>/api/` in `SIDE_EFFECT_PATHS`.
5. **Verify** (all of these, report the numbers):
   ```
   grep -rn "<old path>" frontend enterprise/frontend e2e        # must be empty
   bunx eslint --no-warn-ignored <touched files>
   bun run lint-eslint-pure                                       # enforce-module-public-api included
   bun run type-check-pure
   bun run test-unit-keep-cljs <touched folders' specs>
   bun run module-boundaries 2>&1 | tail -1                       # after; no violation may name the new files
   bun run build-release:static-viz                               # only if viz/static-viz/ui/dayjs touched; hard 3.5 MiB budget
   ```
6. **Report**: count before/after (state count-neutral explicitly), the edges
   removed by file, flags/rules deleted, barrel exports added, anything you
   skipped and why, and any consumer you found that vetoed part of the move.

## Traps (each has bitten at least once)

- **Late binding.** A bare function reference in a `createSelector` input
  array, a component identity captured for comparison, a `PLUGIN_*` object
  read at module scope: all capture at import time and dodge jest spies, EE
  overrides, and lazy loading. Read at call time (`(_state) => fn()`), or
  inject.
- **Plans go stale.** Verify every recipe against current code before
  executing; things get merged, renamed, or turn out never to have existed.
  Skip-and-report beats force.
- **The linter's blind spots**: `export … from` re-exports, bare-specifier
  packages (custom-viz), pre-seeded caches that never register tags. A grep
  for the old path is the stronger claim than a green lint run.
- **Path-keyed baselines reset on rename**: a generated per-file ledger
  silently loses a file's history when it moves.
- **A heavy barrel is a bundle hazard until its module is side-effect free.**
  One constant imported from the `metabase/ui` barrel pulled Mantine into the
  static-viz bundle and broke its budget; the fix was `SIDE_EFFECT_FREE_PATHS`,
  never a deep import.
- **Type augmentation is program-wide.** `declare module "dayjs"` (and
  similar) makes plugin types available to any file in the same tsconfig, so
  a passing type-check never proves the setup ran; only importing the facade
  does.
- **Environment before diagnosis**: after a dependency-touching merge,
  `bun install` before declaring a failure real; worktrees share staleness
  through the node_modules symlink, and a stale `target/cljs_dev` makes
  `type-check-pure` fail on `metabase-lib/metric/core.ts` (rebuild cljs in the
  worktree).

## PR shape

One logical change per PR; the body names the specific edges removed (files,
imports, before/after count) and gives each move's ownership reason in plain
language a reviewer outside the effort can follow, without campaign labels.
Stack only for semantic dependency or same-hot-file serialisation, and say
so. Consider codeowner surface when chunking. Open as a draft until measured
and green.
