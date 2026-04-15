# Analytics-Dev Export: REPL Workflow + CI Test

Turn the instance analytics export process into:

- A process a developer can run from the REPL with one evaluation. It starts
  enough of the Metabase system for the export to succeed but prevents any DWH
  syncs or query activity so we don't pick up spurious diffs from synced
  schemas or result metadata.
- A CI test that confirms the export output matches what's checked in to the
  repo.

## Phase 1 — Embedded Postgres utility

A reusable dev/test utility that starts an
[embedded Postgres](https://github.com/zonkyio/embedded-postgres) and manages
its lifecycle via [Integrant](https://github.com/weavejester/integrant). Usable
for any purpose, and easily pluggable as the app DB when running Metabase
locally.

### Location

Lives under the `test` classpath at
`test/metabase/test/embedded_postgres/core.clj`. Not a module: `modules/` is
for *product* units that ship in the uberjar with enforced boundaries, and an
embedded-Postgres utility has zero production runtime presence. Making it a
module would add ceremony (own `deps.edn`, module-boundaries config, kondo
config) and muddy "what is a module" by mixing product units with dev/test
tooling.

Devs who want to use it locally (e.g. as the app DB when running Metabase from
the REPL) include the `:test` alias when starting their Clojure process. That
already works with Metabase's existing alias conventions.

### Deps

Added under the `:test` alias in `deps.edn` so production builds never pull
them in:

- `io.zonky.test/embedded-postgres` (new)
- `integrant/integrant` (new to the project — first consumer, but the larger
  hybrid component lifecycle migration is going to want it anyway)

### Namespace: `metabase.test.embedded-postgres.core`

The utility owns *no* global state. It provides Integrant multimethods for an
embedded-Postgres component and a generic `with-system` macro; clients decide
how (and whether) to hold the running system — in a local, in a `defonce`, in
a test fixture, whatever fits their call site.

#### Integrant component

- `defmethod ig/init-key ::embedded-postgres [_ {:keys [port data-dir cleanup-on-halt?]}]`
  builds and starts an `EmbeddedPostgres`; returns a value map like
  `{:pg <EmbeddedPostgres> :jdbc-url <str> :port <int> :data-dir <path>}`.
- `defmethod ig/halt-key! ::embedded-postgres [_ {:keys [pg data-dir cleanup-on-halt?]}]`
  stops the process and optionally deletes the data dir.

No `defonce`, no `alter-var-root`, no accessor fns inside this namespace.

#### `with-system` macro

Generic — takes an Integrant config map, inits the system, binds it to a
caller-provided symbol, runs the body inside a `try`, and halts the system in
`finally`. Not specific to embedded-postgres; any Integrant config works.

```clojure
(defmacro with-system
  "Init an Integrant system from `config`, bind it to `sym`, run `body`,
   and halt the system in a finally."
  [[sym config] & body]
  `(let [~sym (ig/init ~config)]
     (try
       ~@body
       (finally
         (ig/halt! ~sym)))))
```

Usage:

```clojure
(with-system [system {::embedded-postgres/embedded-postgres {:port 0}}]
  (let [{:keys [jdbc-url]} (::embedded-postgres/embedded-postgres system)]
    …))
```

Clients that want a long-lived REPL instance can assign the system to their
own `defonce` and call `ig/halt!` themselves — that's their choice, not the
utility's.

#### `install-as-app-db!`

Helper that points Metabase's app DB at a running embedded-Postgres system:
sets `mb.db.connection.uri` (via `System/setProperty`) **before** any
`metabase.app-db` namespace is loaded. Gotcha: `app_db/env.clj` reads env at
load time; `install-as-app-db!` must be called from a dev entrypoint ns that is
required *before* `metabase.app-db.core`. Worst case we expose a dev-only
`reset-connection!` in `metabase.app-db` to re-read env.

### Deliverables

- Integrant multimethods for `::embedded-postgres`.
- Generic `with-system` macro.
- `install-as-app-db!` one-liner for `user.clj`-style REPL flows (requires
  starting the REPL with the `:test` alias so the namespace is on the
  classpath).

## Phase 2 — Retrofit analytics-dev export to a one-eval REPL entry point

New dev/test-scope namespace:
`metabase-enterprise.audit-app.analytics-dev.export`.

### Single entry point: `export!`

One function that, when evaluated, does the full pipeline against a clean
embedded Postgres:

1. Start embedded Postgres via the Phase 1 utility.
2. Point the app DB at it and run `mdb/setup-db!` (or current startup
   equivalent).
3. Create a superuser (bypass the setup-token flow); set `analytics-dev-mode`.
4. Call `create-analytics-dev-database!` **with sync disabled** — extract the
   `sync/sync-database!` call out of that fn or add a `:sync?` opt so the
   export path never invokes it.
5. Call `import-analytics-content!` against the superuser.
6. Call `export-analytics-content!` against `(find-analytics-collection)`
   targeting `resources/instance_analytics/collections/...`.
7. Halt the embedded Postgres system.

Expose `(export!)` as a REPL one-liner and a `-main` wrapper so it can also run
via `clj -X`.

### Preventing spurious diffs

Two kinds of noise to kill:

- **Schema sync.** Split `sync/sync-database!` out of
  `create-analytics-dev-database!` so the export flow never runs it.
  Instance-analytics needs the `Database` row but not sync'd field metadata in
  the app DB.
- **Query activity / result metadata.** Import uses
  `serialization/load-metabase!` which may re-run card queries to populate
  `result_metadata`. Verify empirically. If it does, either pass an option to
  skip, or wrap the export in a guard that `with-redefs`-throws on
  `qp/process-query`. The principled fix: ensure card `result_metadata` in the
  canonical YAML is what gets round-tripped and no QP runs. Add a loud guard
  that fails if any QP invocation happens during export.
- **Scheduled tasks and sync hooks.** Keep `task/start-scheduler!` off; disable
  sync hooks (dynamic var or startup flag) for the duration of `export!`.

## Phase 3 — CI test for export determinism

New test:
`enterprise/backend/test/metabase_enterprise/audit_app/analytics_dev/export_test.clj`.

- Uses the `with-embedded-postgres` macro.
- Runs `export!` into a tmp dir.
- Walks the tmp dir and
  `resources/instance_analytics/collections/main/usage_analytics/` and asserts
  YAML-structural equality (parsed YAML, not byte-for-byte, to avoid formatter
  noise). If structural equality holds but bytes differ, report it as a
  separate soft failure to catch formatter drift.
- On failure: print the first diverging file and a `diff -u` hint so the PR
  author can re-run `export!` and commit.
- Tagged for the enterprise backend CI job. Initial budget ~60s (embedded pg
  boot + migrations + import/export). If that's too slow for normal CI, move
  to a nightly job and keep a faster smoke test on PRs.

## Risks / open questions

1. **App-db init ordering.** `app_db/env.clj` reads env at load time — confirm
   whether `install-as-app-db!` can run after ns load. May need
   `alter-var-root` on the env map or a dev-only `reset-connection!`.
2. **Integrant as a new project dep.** Small and stable, but new and global.
   Worth a heads-up on the PR.
3. **`load-metabase!` running queries.** Needs empirical confirmation; the
   answer shapes how much Phase 2 has to suppress.
4. **Deterministic output.** Timestamps, `entity_id`s, and ordering must
   already be deterministic or the Phase 3 test will be flaky. If current
   export has non-determinism, Phase 3 will surface it and we'll need to fix
   sorting / normalization as part of this work.
5. ~~Module location.~~ Resolved: lives under `test/metabase/test/` on the
   `:test` alias. Not a module — modules are for product units that ship in
   the uberjar, not dev/test tooling.