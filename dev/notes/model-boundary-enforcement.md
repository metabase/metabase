# Toucan2 Model Boundary Enforcement

## What it does

The module system controls which *namespaces* can be imported between modules.
Model boundary enforcement extends this to `:model/X` keywords — controlling
which Toucan2 models each module can reference.

Two optional config keys per module in
`.clj-kondo/config/modules/config.edn`:

| Key              | Default | Meaning |
|------------------|---------|---------|
| `:model-exports` | `#{}`   | Set of `:model/X` keywords this module allows **others** to use. |
| `:model-imports` | `#{}`   | Set of `:model/X` keywords **this module** may use from other modules. |

When omitted, no models are exported/imported (closed by default). `:any`
opens all restrictions.

`:model-imports` also supports `:bypass` for cross-cutting modules that
reference nearly every model (e.g. `cmd`, `enterprise/serialization`). A
bypassed module can reference any model — even unexported ones. Models that
are *only* referenced by bypass modules do not need `:model-exports` entries
(the staleness test will flag them if added).

## Why it exists

Two core ideas:

1. Some models need encapsulation.
2. Some modules should be storage-agnostic.

This makes both enforceable.

**Encapsulation.** Some domain models span multiple tables with complex
invariants. `enterprise/workspaces`, for example, involves `WorkspaceInput`,
`WorkspaceGraph`, `WorkspaceTransform`, and others whose internal relationships
should be managed exclusively by that module. `:model-exports` lets a module
declare a public surface area (e.g. only `#{:model/Workspace
:model/WorkspaceMergeTransform}`) while keeping internal models private.

**Testability and performance.** Restricting model access makes it easier to
reason about where blocking IO happens. Some models are more expensive than
others (large tables, complex hooks). Modules that receive data as arguments
rather than querying models directly are easier to test and easier to reason
about performance-wise.

**Jekyll mode.** In Jekyll mode, artifact definitions live in files on disk
rather than being mutated directly in the app-database. The less a module
depends on direct model access today, the less work needed to make it
compatible. Restricting model imports nudges modules in this direction
incrementally.

**Shared logic across storage backends.** Workspaces use parallel models
(`:model/Transform` / `:model/WorkspaceTransform`) backed by separate tables.
This design may change in future. While it exists, core algorithms like
dependency ordering and query compilation need to work identically for both.
If `transforms-base` restricts its model imports, it *must* be written in a
storage-agnostic way — accepting data as arguments rather than hardcoding model
references. Adding this validation caught a real regression where new code in
`transforms-base` had introduced direct `:model/Transform` references.

## How it works

Model ownership is derived automatically by scanning source files for
`(*/defmethod t2/table-name :model/X ...)` calls (any symbol ending in
`/defmethod`). No manual ownership configuration is needed.

At test time (`metabase.core.modules-test`), the system:

1. Builds a map of `:model/X` to owning module by scanning all source files
2. For each source file, finds all `:model/X` keyword usages
3. Checks each reference against:
   - The defining module's `:model-exports` (is this model exported?)
   - The using module's `:model-imports` (is this module allowed to use it?)
   - The model definition exists somewhere (unknown models are always a violation)

### Violation types

| Type              | Meaning |
|-------------------|---------|
| `:not-exported`   | The defining module restricts `:model-exports` and this model is not in the set |
| `:not-imported`   | The using module restricts `:model-imports` and this model is not in the set |
| `:unknown-model`  | The model definition was not found anywhere (always a violation) |

### Exemptions

- `metabase.models.resolution` is exempt (it intentionally references all
  models as a registry)
- Test namespaces are excluded by the existing `ignored-namespace-patterns`
- Same-module references are always allowed

## How to use it

### Restricting a module's exports

Add `:model-exports` to the module's config entry:

```clojure
enterprise/workspaces
{:team "Metabot"
 :model-exports #{:model/Workspace :model/WorkspaceMergeTransform}
 ...}
```

Only the listed models can be referenced from other modules. All other models
defined in this module become internal.

For example, if a module exports only `:model/Workspace`, then a use of
`:model/WorkspaceInput` from another module will fail with `:not-exported`.

### Restricting a module's imports

Add `:model-imports` to the module's config entry:

```clojure
transforms-base
{:team "Querying"
 :model-imports #{:model/Database :model/DatabaseRouter :model/Field :model/Table}
 ...}
```

The module can only reference these models from other modules. Any other
`:model/X` keyword in the module's source files will cause a test failure.
Unknown models (not defined anywhere) are also violations.

### Bypassing import restrictions

Some modules are inherently cross-cutting and import nearly every model. Use
`:bypass` instead of an explicit set:

```clojure
cmd
{:team "UX West"
 :model-imports :bypass
 ...}
```

A bypassed module can reference any model, even unexported ones. This means
bypass modules don't drive `:model-exports` — if a model is *only* used
outside its home module by bypass modules, it doesn't need to be exported.

Use sparingly. Prefer explicit sets where feasible.

### Verifying changes

```bash
./bin/test-agent :only '[metabase.core.modules-test]'
```

Or at the REPL:

```clojure
(dev.deps-graph/model-ownership)           ;; see which module owns each model
(dev.deps-graph/model-boundary-violations) ;; find any violations
```

The test also validates that configured `:model-exports` / `:model-imports`
only mention known models, that exported models are actually owned by the
module exporting them, and that no stale entries exist (exports not referenced
externally, imports not referenced in the module's source files).

### Computing model boundaries

Use the dev namespace to see what the config should contain:

```clojure
(dev.model-boundary-config/compute-model-boundaries) ;; returns data
(dev.model-boundary-config/update-config!)           ;; rewrite config.edn
```

## Limitations and future directions

Each limitation below has a natural extension.

**Keyword scanning isn't airtight.** Code can access the app-database without
`:model/X` keywords — via non-namespaced keywords like `:transform`, raw SQL
through `t2/query`, or table-name strings. The enforcement catches conventional
usage but not determined workarounds. A stronger approach: ban `toucan2.core`
entirely for pure modules via a `:banned-requires` config key, closing all
loopholes at once.

**Binary access control.** A module either can or cannot reference a given
model. A natural refinement: distinguish read-only vs read-write access, which
is particularly relevant for Jekyll mode where reads (from the app-database as
cache) are acceptable but authoritative writes are not.

**No transitive checking.** Only keywords appearing directly in a module's
source files are checked. If module A calls a function in module B that
internally references `:model/Transform`, this is not flagged against A. A
future extension could check transitive model access through module
dependencies, possibly with different restrictions for direct vs transitive
references.

**Static-only.** Static analysis operates at the module level and can't
distinguish code paths within a module. Runtime enforcement could provide
stronger guarantees that certain code paths are pure, complementing the
read-only/read-write distinction above.

## Design decisions

- **Test-time enforcement, not compile-time.** Keeps the implementation simple
  (source scanning with rewrite-clj) and avoids adding overhead to normal
  development. The tradeoff: violations are only caught when tests run.

- **Closed by default.** Both `:model-exports` and `:model-imports` default
  to `#{}`. New modules must explicitly declare their model dependencies.
  All existing modules have explicit config entries populated from a scan of
  actual usage (see `dev.model-boundary-config`).

- **Ownership is derived, not configured.** Instead of manually mapping models
  to modules, ownership is determined by scanning for `t2/table-name` defmethod
  calls. Avoids config duplication and stays in sync automatically.
