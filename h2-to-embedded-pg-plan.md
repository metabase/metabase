# Replace H2 with Embedded Postgres as the Default Bundled App DB

## What

Today, when a user runs the Metabase uberjar with no `MB_DB_*` env vars, they get an H2 file (`metabase.db.mv.db`) as the application database. This plan replaces that default with a bundled, embedded PostgreSQL distribution managed by [Zonky's `embedded-postgres`](https://mvnrepository.com/artifact/io.zonky.test.postgres).

Two deliverables:

1. **Default bundled app DB swap.** Bare-uberjar startup spins up a local Postgres in a data dir, listens on a loopback port, and uses it as the app DB.
2. **One-time auto-migration from H2.** Existing users with an H2 file boot the new version once and have their data automatically copied into the embedded Postgres instance with no action required. The original H2 file is preserved as a backup.

The goal is that eventually we can remove H2 as a supported driver altogether.

---

## Product Implications

The main factors to consider in this decision are:

- Running Embedded Postgres requires having a Postgres binary on the target machine that matches the machine's architecture, e.g. x86_64-apple-darwin. The options are:
   - Pre-package binaries in the JAR for each platform we want to support. This means an extra ~100-200 MB of JAR size depending on which platforms we select.
   - Dynamically download the right binary at runtime

### Platform support coverage change

H2 runs on any JVM. Zonky's Embedded Postgres requires a binary specific to the running platform, so support is tied to which binaries we bundle (or fetch at runtime). Source of truth for available binaries: https://mvnrepository.com/artifact/io.zonky.test.postgres

The "Embedded PG (recommended bundle)" column reflects the **minimum-viable 7-classifier bundle** described in the size analysis below. The "Embedded PG (full bundle)" column reflects bundling all 13 actively maintained classifiers.

| Platform | H2 support today | Embedded PG (recommended bundle) | Embedded PG (full bundle) | Support changing? |
|---|---|---|---|---|
| Linux x86_64 (glibc) | yes | yes | yes | no change |
| Linux x86_64 (Alpine/musl) | yes | yes | yes | no change |
| Linux arm64 (glibc) | yes | yes | yes | no change |
| Linux arm64 (Alpine/musl) | yes | yes | yes | no change |
| macOS Intel | yes | yes | yes | no change |
| macOS Apple Silicon | yes | yes | yes | no change |
| Windows x86_64 | yes | yes | yes | no change |
| Linux i386 (glibc) | yes | **dropped** | yes | bundle-dependent |
| Linux i386 (Alpine) | yes | **dropped** | yes | bundle-dependent |
| Linux 32-bit ARMv7 (glibc) | yes | **dropped** | yes | bundle-dependent |
| Linux 32-bit ARMv6 (Alpine only) | yes | **dropped** | yes | bundle-dependent |
| Linux ppc64le (glibc) | yes | **dropped** | yes | bundle-dependent |
| Linux ppc64le (Alpine) | yes | **dropped** | yes | bundle-dependent |
| Linux s390x (IBM Z) | yes | **dropped** | **dropped** | yes — lost |
| FreeBSD / OpenBSD / illumos | yes | **dropped** | **dropped** | yes — lost |
| Windows arm64 | yes | **dropped** | **dropped** | yes — lost |
| Windows i386 | yes | **dropped** (Zonky variant stale since Nov 2022) | **dropped** | yes — lost |

Users on platforms where the bundled DB is dropped can still run Metabase by configuring an external Postgres or MySQL via `MB_DB_TYPE`/`MB_DB_HOST`. They lose only the zero-config bundled-DB option.

### JAR size impact

Current uberjar: ~638 MB. Top three bundling strategies:

| Strategy | JAR size after | Delta | Notes |
|---|---|---|---|
| Recommended: minimum-viable bundle (7 classifiers) | ~774 MB | +136 MB (+21%) | Covers all platforms our official Docker images and standard distribution channels target. |
| Alternative: full bundle (13 classifiers) | ~854 MB | +216 MB (+34%) | Preserves today's full Linux platform reach (i386, arm32, ppc64le). |
| Alternative: per-platform uberjars | varies (-3 MB to +30 MB) | varies | Smallest per artifact, but ships 7+ different downloads instead of one. Fundamentally changes our distribution model. |

**Recommendation: minimum-viable 7-classifier bundle.** A 21% increase is real but tolerable, and we keep "build once, run anywhere" for our supported platforms. We can expand the bundle later if telemetry shows real usage on i386/arm32/ppc64le.

(All figures include the H2 driver still present during phases 1–3, since the migration tool needs to read H2 files. After H2 is fully removed in phase 4, subtract ~2.5 MB.)

A possible further size reduction: Zonky ships `*-lite` Alpine variants without contrib modules. For our app-DB use case those should be sufficient. Worth measuring before locking final estimates.

---

## How a Customer Upgrades

A new version of Metabase ships with:
- logic to use Embedded Postgres as the default app db driver
- Read support in the H2 driver to migrate data from H2 to embedded postgres
- Read-write/full featured support in the Postgres driver for embedded postgres
- Migration process to migrate data from H2 to embedded postgres on start-up

For a typical customer running the Metabase uberjar with their existing H2 file, the upgrade is fully automatic:

1. They download the new Metabase JAR and start it as before.
2. On first boot, Metabase detects the existing H2 file (`metabase.db.mv.db` or its v1 predecessor).
3. Metabase starts the bundled Postgres in a new data directory next to the H2 file (e.g., `embedded-pg-data/`).
4. Metabase runs Liquibase against the empty Postgres to create the schema, then copies all rows from H2 into Postgres inside a single transaction.
5. On success, the H2 file is **atomically renamed** to `metabase.db.mv.db.migrated-<timestamp>` (preserved as a backup, not deleted).
6. A second backup copy is also written: `metabase.db.mv.db.pre-embedded-pg-backup`.
7. Metabase logs the migration outcome (rows transferred, time taken, location of the H2 backups) and continues startup normally.
8. On subsequent restarts, the existence of `PG_VERSION` in the data directory tells Metabase the migration has already happened; it skips the migration check and starts directly against the embedded Postgres.

If anything fails during the copy:
- The transaction rolls back; the embedded data dir is wiped to a clean state.
- The H2 file is left untouched.
- Metabase exits non-zero with a clear error pointing to the failed step.
- The user can re-run after fixing the issue, or stay on the prior Metabase version.

Customers using an external Postgres or MySQL today (`MB_DB_TYPE` already set) see no change at all — the auto-migration only fires when `MB_DB_TYPE` resolves to `embedded-pg`, which by default happens only when no `MB_DB_*` is configured.

### Downgrade path

If a user needs to roll back to the prior Metabase version after migrating, the manual procedure is:

1. Stop the new Metabase.
2. Rename `metabase.db.mv.db.pre-embedded-pg-backup` back to `metabase.db.mv.db`.
3. Start the prior version's JAR.
4. Any data created in Metabase after the migration (and only on the embedded-PG side) is lost.

This is documented in release notes; we don't try to make downgrade transparent. The old JAR cannot be modified to detect the new state.

### Pre-flight verification (for cautious operators)

A new CLI command lets ops verify the migration against their actual H2 file without touching production state:

```
java -jar metabase.jar check-h2-migration
```

This runs the migration into a temporary data dir, reports row counts per table and any errors, then cleans up.

---

## User-Visible Differences

### Storage and durability model

Both H2 (file mode) and embedded Postgres (with `Builder.setDataDirectory`) provide durable persistence on the local filesystem. They are equivalent in the "your data survives a restart" sense; they differ in how that durability is implemented and what operators see day to day. Side-by-side:

| Aspect | H2 (file mode, today) | Embedded Postgres (Zonky, with `setDataDirectory`) |
|---|---|---|
| On-disk layout | Single `metabase.db.mv.db` file (+ `.trace.db`) | Data directory tree: `PG_VERSION`, `base/`, `pg_wal/`, `pg_xact/`, `postmaster.pid`, etc. |
| First-boot init cost | File created on first connection (~ms) | `initdb` runs once on the empty dir (~1 s; locale captured here) |
| Crash recovery | Automatic on next open, via the MVStore log inside the .mv.db file | Automatic on next start, via WAL replay; battle-tested at scale |
| Default `fsync` semantics | Durable on commit | Durable on commit (`fsync=on`, `synchronous_commit=on`) |
| Disk-usage profile | Roughly = data size; in-place rewrites | Data + WAL retention until next checkpoint (default `max_wal_size = 1 GB`) + a few MB of system catalogs. Realistic minimum: data + 100–200 MB. |
| Process model | Pure-JVM library | Postmaster + helper backends running as native subprocesses; lifecycle owned by us |
| File lock | Per-`.mv.db` file lock | `postmaster.pid` in the data dir; refuses second start; auto-cleans stale on restart |
| Hot backup | None built in; need to stop or use SCRIPT command | `pg_dump` over the local port while running; `pg_basebackup` for filesystem snapshots |
| Cold backup | Copy the .mv.db file while stopped | Tar / rsync the data dir while stopped |
| Restoring a backup | Drop the file in place | Either `psql < dump.sql` against an empty data dir, or replace the data dir wholesale |
| Portability across hosts | Move the file anywhere — any JVM works | Move the data dir; works on the same OS family + CPU arch + Postgres major version. `pg_upgrade` needed for major bumps. |
| Container volume mounts | File mount works, but a directory mount is also fine | Must be a **directory** mount, not a file mount — this is a docs/migration gotcha |
| Filesystem permissions | Whatever the JVM user has | Postgres on Unix refuses to start unless the data dir is mode 0700 owned by the running user. Zonky handles this; operators bind-mounting volumes need to be aware. |
| Filesystem support | Anything Java sees | Anything Postgres supports — broadly the same set, but Postgres rejects some networked filesystems by default (NFS without right options, SMB, etc.) |
| Locale capture | None | OS locale is captured at `initdb` time and frozen into the data dir. Moving the dir to a system with a different locale produces warnings; rare but worth flagging. |

**Operationally relevant takeaways for the plan and docs:**

1. **Disk sizing**: tell users to plan for `data + ~200 MB WAL` instead of just data size. If their H2 file was 50 MB, they should expect the embedded-PG dir to occupy 250–300 MB.
2. **Volume mount**: existing docker-compose / Helm examples that mount a single file (or a parent dir of `metabase.db.mv.db`) need to be updated to mount the new dir.
3. **Backup approach changes**: H2 was "stop, copy the file." Embedded-PG should be "run `pg_dump --host=localhost --port=<port> --username=postgres metabase > backup.sql`," which works while Metabase is running. The local port is exposed via a startup log line.
4. **Process lifecycle hygiene**: if the JVM is killed with `kill -9` and the JVM shutdown hook doesn't fire, the postmaster subprocess can linger and block the next start with a stale `postmaster.pid`. Postgres self-recovers on the next start (it checks PID liveness), but we should also implement a defensive "stale PID detection and cleanup" path on startup. Lean on Zonky's existing logic and add a wrapper test for the hard-kill case.
5. **WAL retention**: default `max_wal_size = 1 GB` is fine for typical Metabase apps, but on very small VMs with tight disk budgets we may want to set it lower in the embedded config to bound disk usage. Consider exposing one or two PG tuning knobs via `MB_*` env vars in a follow-up if the defaults aren't quite right.
6. **Locale**: Zonky's defaults use `--locale=C` or the system locale depending on platform — verify which during PR 1.2 and explicitly set `--encoding=UTF8 --locale=C.UTF-8` (or equivalent) at `initdb` time so the data dir is portable across hosts.

### Other things a user or operator will see change

- **A new `MB_DB_TYPE` value: `embedded-pg`.** Becomes the default. Setting `MB_DB_TYPE=h2` continues to work through phases 1–3 for users who want to opt out. Phase 4 removes that option.
- **Log lines reference `embedded-pg`** instead of `h2`. Example: `Setting up embedded-pg test DB and running migrations...`
- **A loud one-time migration log on first boot** with the row-count and the path to the preserved H2 backups.
- **A startup log every boot** identifying the data dir and the auto-assigned local port: `Using bundled Postgres at <data-dir> on port <port>; for HA or sharing across hosts, configure an external Postgres.`
- **No more H2 production warning.** The existing "running H2 in production" warning at `app_db/env.clj:150-161` is suppressed for `embedded-pg`.
- **Cold-start latency increases.** Zonky takes 1–3 seconds to extract binaries on first run, then ~0.3–0.8 seconds per restart for Postgres to come up. H2 was effectively zero.
- **Idle resource usage rises slightly.** PG defaults are conservative but use ~30–50 MB RAM idle and run a few helper processes. Document for small-VM users.
- **An updated migration doc** (`docs/installation-and-operation/migrating-from-h2.md`) — by phase 3 this is mostly a "you don't need to do this anymore" page, plus a new "bundled Postgres" section covering data dir, port, backup, and the platform-support change.

---

## Implementation Details (for engineers)

### Prior art in the repo (load-bearing)

The codebase is set up for this work to a remarkable degree:

- Zonky's `io.zonky.test/embedded-postgres` 2.2.2 + per-platform binary classifiers are already declared as **dev-only** dependencies in `deps.edn:271-280`.
- A working Integrant lifecycle for Zonky exists in tests at `test/metabase/test/embedded_postgres/core.clj` and a passing smoke test at `test/metabase/test/embedded_postgres/db_server_test.clj`.
- A complete row-by-row copy engine that already handles `:h2 ↔ :postgres ↔ :mysql` with all schema migrations, FK disable/reenable, sequence resets, and transactional rollback is at `src/metabase/cmd/copy.clj`. Used today by `load-from-h2!` (`src/metabase/cmd/load_from_h2.clj`) and `dump-to-h2!` (`src/metabase/cmd/dump_to_h2.clj`).
- A working precedent for "sniff a file at startup and silently migrate it": `src/metabase/app_db/update_h2.clj` — auto-detects H2 v1.x files via the MV header and runs an in-place upgrade. Invoked from `data_source.clj:148,172`. The new H2→PG migration follows the same shape.

The migration tooling is ~80% built. Most of this project is plumbing.

### Architecture overview

`db-type` is a keyword (`:h2 | :postgres | :mysql`) threaded through everything. Branching is concentrated in:

- `src/metabase/app_db/env.clj:43` — env→db-type resolution; defaults to `:h2` per `config/core.clj:49`.
- `src/metabase/app_db/spec.clj:9` — `defmulti spec` for JDBC URL construction per type.
- `src/metabase/app_db/connection.clj:79` — pre-condition guard `(#{:h2 :mysql :postgres} db-type)`.
- `src/metabase/app_db/setup.clj` — Liquibase invocation; `:postgres` and `:h2` share `databasechangelog` table name (line 177); `:h2` has special-case lock release (line 213, 224).
- `src/metabase/app_db/liquibase.clj` — H2-specific dialect setup at lines 116–120.
- `src/metabase/app_db/cluster_lock.clj:110-132` — separate in-process H2 RW locks because H2 doesn't honor query timeouts on `SELECT ... FOR UPDATE`.
- `src/metabase/cmd/copy.clj:432` — `copy!` schema accepts `[:enum :h2 :postgres :mysql]` for both sides.
- `src/metabase/cmd/copy.clj:283-319` — per-type FK disable/reenable.
- `src/metabase/cmd/copy.clj:418-428` — H2 sequence-reset SQL.

Liquibase changelogs are dialect-aware via `dbms: h2` / `dbms: postgresql` markers (e.g., `resources/migrations/061/20260326_enhanced_usage_analytics.yaml:401`). **Embedded PG is plain PG**, so it inherits all `dbms: postgresql` paths. No changelog edits required for the new app DB.

### Recommendation: introduce `:embedded-pg` as a distinct db-type

Do **not** silently make `MB_DB_TYPE=embedded-pg` masquerade as `:postgres` everywhere. Three reasons:

1. We need a separate code path that owns the embedded-server lifecycle (start, port assignment, data dir, shutdown hook, lock detection) before any data source is constructed.
2. Cluster-lock semantics (`cluster_lock.clj`) for embedded PG are PG-like (only one process can bind the data dir), so we want PG behavior there, not H2 behavior — but we still want a distinct keyword for analytics, telemetry, config docs, and operator-facing logs.
3. After the embedded server is started, the JDBC layer is plain Postgres — so for everything downstream (Liquibase, HoneySQL dialect, sequence resets, FK constraints, quoting), we map `:embedded-pg → :postgres`. That mapping should live in exactly one place — a new `mdb.connection/effective-db-type` — and every other site keeps using `(db-type)`.

This gives a single switch (`:embedded-pg` vs the plain `:postgres` you'd use against an external server) that the migration tool, cluster-lock module, and operator-facing logs can read without leaking embedded-server details into the rest of the codebase.

### Phase plan (PR-sized units)

#### Phase 1 — Land embedded-PG as opt-in app DB

Goal: `MB_DB_TYPE=embedded-pg ./metabase.jar` boots into a fully working embedded Postgres. Default is still H2.

**PR 1.1 — Promote Zonky deps from `:dev` to top-level.**
- Move `io.zonky.test/embedded-postgres` and the existing binary classifier jars from `deps.edn:271-280` (currently inside `:dev`) into the top-level `:deps` map.
- Add the binary classifiers we don't yet have. Recommended bundle:
  - `embedded-postgres-binaries-linux-amd64-alpine` (required for our Alpine Docker image)
  - `embedded-postgres-binaries-linux-arm64v8-alpine` (required for our linux/arm64 Alpine Docker image — confirmed available)
  - Existing: `linux-amd64`, `linux-arm64v8`, `darwin-amd64`, `darwin-arm64v8`, `windows-amd64`
- Consider using `io.zonky.test.postgres:embedded-postgres-binaries-bom` to keep all binary versions pinned together via Maven dependency management.
- Bump all binaries to the same version (currently aligned at 18.3.0 in dev, but the alpine variant in `~/.m2` is 14.22.0 — verify Zonky publishes alpine-amd64 at 18.3.0 across all alpine variants we want).
- Optional: also bundle `linux-i386`, `linux-i386-alpine`, `linux-arm32v7`, `linux-arm32v6-alpine`, `linux-ppc64le`, `linux-ppc64le-alpine` if we want to preserve current platform reach. Each adds ~10–15 MB.
- Update Antq exclusions if needed.

**PR 1.2 — Promote the Integrant component to `src/`.**
- Move `test/metabase/test/embedded_postgres/core.clj` to `src/metabase/app_db/embedded_pg.clj` (or `src/metabase/app_db/embedded_postgres/server.clj`). Drop the `::db-server` integrant key — at production scope we don't need integrant; expose plain `start!`/`stop!` functions returning a record with `{:pg, :port, :data-source}`.
- Add a `data-dir` argument (default: `<MB_DB_FILE_DIR>/embedded-pg-data` — alongside where `metabase.db.mv.db` lives today, so users with persistent volumes don't accidentally lose state).
- Use `EmbeddedPostgres$Builder.setDataDirectory(File)` and `setCleanDataDirectory(false)` so the data dir is reused across restarts. Use `setOverrideWorkingDirectory` if needed to control where the binaries are extracted (default is a per-user cache dir, which is fine but worth documenting).
- Bind to `127.0.0.1` only (`setServerConfig "listen_addresses" "127.0.0.1"`). Pick a random free port (`setPort 0`) to avoid collisions; expose the resolved port via `.getPort`.
- Use Unix domain sockets where supported (`setUnixSocketDirectory`) for ~10% lower per-query latency and better isolation; fall back to TCP on Windows.
- Register a JVM shutdown hook to call `.close()` so PG gets a clean SIGTERM. The existing `core/core.clj:169` shutdown hook is a good place to wire this in.

**PR 1.3 — Wire `:embedded-pg` through the app-db plumbing.**
- `src/metabase/app_db/env.clj:43` — extend the `mu/defn-` enum to include `:embedded-pg`.
- `src/metabase/app_db/env.clj:103-119` — add an `env-defaults` defmethod for `:embedded-pg` (no host/port; data-dir defaults).
- `src/metabase/app_db/env.clj:94-99` — when `db-type = :embedded-pg`, **start the server first**, then build the data source from the resolved JDBC URL (`jdbc:postgresql://localhost:<port>/postgres?user=postgres`). The startup must happen here because `data-source` is dereferenced as a `def` at namespace load.
- `src/metabase/app_db/spec.clj` — add a `defmethod spec :embedded-pg` that accepts `{:port, :db, :user}` and produces a postgres-shaped JDBC spec.
- `src/metabase/app_db/connection.clj:79` — extend the precondition set to include `:embedded-pg`.
- Add `mdb.connection/effective-db-type`: `(case db-type :embedded-pg :postgres :else db-type)`. Use this for the Liquibase dialect, quoting style, sequence reset, FK constraint code in `copy.clj`, etc. — anywhere the keyword affects SQL generation. Audit:
  - `src/metabase/app_db/connection.clj:101-109` (quoting-style)
  - `src/metabase/app_db/setup.clj:177` (changelog table-name, already `:postgres`/`:h2` tuple)
  - `src/metabase/cmd/copy.clj:283`, `:297`, `:301`, `:317`, `:397`, `:400`, `:418` (per-type defmethods)
  - `src/metabase/app_db/cluster_lock.clj` (must follow the Postgres path, not H2 — embedded PG honors lock timeouts)
  - All call sites comparing `(= (db-type) :h2)` or `(= (db-type) :postgres)` — there are dozens. For embedded-pg, all should follow the `:postgres` branch. Mechanical change but the largest chunk in this phase.
- Liquibase changelogs: zero changes. `dbms: postgresql` already covers it.

**PR 1.4 — Config docs and warning suppression.**
- Update `src/metabase/cmd/resources/other-env-vars.md:126` to add `embedded-pg` to the enum.
- In `src/metabase/app_db/env.clj:150-161`, suppress the H2 production-warning logic for `:embedded-pg`.
- Add the one-line "Using bundled Postgres at <data-dir>" warning the first time `:embedded-pg` starts.

**PR 1.5 — Tests.**
- Move/adapt the existing `test/metabase/test/embedded_postgres/db_server_test.clj`.
- Add a setup-db! → run-Liquibase → boot-Metabase → seed-Sample-DB → smoke-test cycle against `:embedded-pg`. Most existing app-db tests parameterize over `(:h2 :postgres :mysql)` — extend to include `:embedded-pg` (mostly test-config; runtime behavior is identical to `:postgres` after the effective-db-type indirection).

After Phase 1, embedded-PG works as an opt-in app DB. Default is still H2. No migration tooling yet. Total LOC: ~400–600 lines across ~10 files.

#### Phase 2 — Auto-migrate H2 → embedded-PG at startup

Goal: a user running `MB_DB_TYPE=embedded-pg` (or by Phase 3 the default) with an existing `metabase.db.mv.db` next to it gets seamlessly migrated.

**PR 2.1 — Extract a generic copy-from-H2 callable from `load-from-h2!`.**
`src/metabase/cmd/load_from_h2.clj:26-37` already does `(copy/copy! :h2 h2-data-source target-type target-data-source)`. Extract a non-CLI function `metabase.cmd.load-from-h2/copy-h2-to!` taking `(target-db-type, target-data-source, h2-filename)`, returning nothing on success, throwing on failure.

**PR 2.2 — Add the auto-migrate gate.**
In `src/metabase/app_db/env.clj` (or a new `src/metabase/app_db/embedded_pg/auto_migrate.clj`), after the embedded-PG server has started but **before** `setup-db!` runs Liquibase against it, check:
1. Is `db-type` `:embedded-pg`?
2. Does the embedded data dir contain a non-empty PG instance? (Detected by `PG_VERSION` file presence — pre-Liquibase.)
3. Does an `.mv.db` file exist at `(env/db-file)` (or `MB_LEGACY_H2_DB_FILE` if set)?

If (1) AND NOT (2) AND (3):
1. Copy `metabase.db.mv.db` to `metabase.db.mv.db.pre-embedded-pg-backup` (defensive double backup for downgrade).
2. Start a PG-against-embedded data source.
3. Run Liquibase migrations on it (target empty-but-schema-ready). `copy/copy!` already does this at `copy.clj:447`.
4. Run `copy-h2-to! :embedded-pg target-data-source h2-filename`. The existing `copy!` wraps everything in a transaction with `with-connection-rollback-only` (`copy.clj:457-463`) — atomic.
5. On success, atomically rename: `metabase.db.mv.db` → `metabase.db.mv.db.migrated-<timestamp>`. Use `Files/move` with `ATOMIC_MOVE` (same pattern as `update_h2.clj:82`).
6. Write a sentinel file `embedded-pg-data/.migrated-from-h2` recording source path, timestamp, and Metabase version.
7. Log loudly.

On failure: leave the H2 file untouched, drop and recreate the embedded data dir (a failed migration must not leave a half-populated PG instance), exit non-zero. Do not auto-fall-back to H2 — version skew across PRs would silently keep users on H2 forever.

**PR 2.3 — Stale-backup warning.**
Startup task that warns if `metabase.db.mv.db.migrated-*` is older than 30 days. Don't auto-delete; user might still need it for support.

**PR 2.4 — Pre-flight checker CLI command.**
New `^:command check-h2-migration` in `src/metabase/cmd/core.clj` runs the migration into a tmp data dir, reports row counts and errors, cleans up. Lets ops verify against their real H2 file before flipping the switch.

**PR 2.5 — Encryption handling.**
The existing `mdb.encryption` flow (`src/metabase/app_db/encryption.clj` via `setup.clj:195-217`) checks `MB_ENCRYPTION_SECRET_KEY` against an `encryption-check` setting in the DB. Verify this works after migration: H2 data is read while encrypted, written into PG still encrypted, post-setup encryption check passes. Should be a no-op since `copy.clj` is byte-for-byte at the row level. Add an explicit test.

#### Phase 3 — Switch the default

Goal: bare uberjar, no env vars → embedded-PG.

**PR 3.1 — Flip the default.**
- `src/metabase/config/core.clj:49` — `:mb-db-type "embedded-pg"`.
- Audit every site that defaults to `:h2` when `mb-db-type` is unspecified. Basically just `env.clj`, which now resolves through `config/core.clj`.

**PR 3.2 — Release-note + docs work.**
- Update `docs/installation-and-operation/migrating-from-h2.md` (now mostly a "you don't need to do this anymore" page).
- Add a new "bundled Postgres" section in installation docs: data dir, port, backup story (`pg_dump` over the JDBC URL), platform-support change.

**PR 3.3 — Cross-version-migrations test extension.**
The existing `app-db.yml` and `cross-branch-migrations.yml` workflows already test PG. Add a job that boots Metabase with an existing H2 file and confirms the auto-migration path. Reuse `cross-version/` fixtures.

#### Phase 4 — Remove H2 as an app-DB option

Ship a version where H2 is gone except as the migration-source format.

**PR 4.1 — Restrict `:h2` to source-only.**
- `src/metabase/app_db/connection.clj:79` — drop `:h2` from the allowed set.
- `src/metabase/app_db/env.clj:43` — drop `:h2` from the enum.
- Reject `MB_DB_TYPE=h2` at startup with an error pointing to migration docs.
- Keep `org.h2:h2` in `deps.edn` because:
  - The auto-migration in PR 2.2 still needs to read H2.
  - The `dump-to-h2` CLI is used as a serialization/backup format (see cloud-migration usage at `core.clj:190`).
  - The `metabase.driver.h2` data-source driver lets users connect to an external H2 as a *data warehouse* — different concern entirely.
- Remove H2-specific code paths from `cluster_lock.clj` only if no other caller uses them.
- Audit `effective-db-type` callers — once H2 is no longer an app DB, the indirection's only job is `:embedded-pg → :postgres`. Could simplify but probably leave for clarity.

**PR 4.2 — Strip H2 dialect from new Liquibase changesets.**
Existing `dbms: h2` blocks stay (legacy migrations need to run against H2 *during* the auto-migration in PR 2.2). Going forward, new changesets shouldn't need an H2 variant. Add a CI lint to enforce.

**PR 4.3 — Drop `cmd/dump-to-h2`-as-app-db-target if cloud migration moved to a different format.** Out of scope for this plan; flag it.

This phase ships one or two majors after Phase 3 to give users a long migration window. Suggest: Phase 3 in MB N, Phase 4 in MB N+2.

### Migration tool design (detail)

Putting Phase 2.2 together explicitly:

```
On startup, after env resolution but before setup-db!:
  if db-type != :embedded-pg: skip
  start embedded-pg server in <data-dir>
  if data-dir already initialized (PG_VERSION exists):
    skip migration (this is a normal restart)
    return
  legacy-h2 = (env/db-file)         ; resolves the default `metabase.db` path
  if no .mv.db file there: skip migration (fresh install)
  log/warn "Detected H2 application database, will auto-migrate to bundled Postgres."
  try:
    copy legacy-h2.mv.db → legacy-h2.mv.db.pre-embedded-pg-backup
    setup-db!(:embedded-pg, target-ds, auto-migrate?=true, sample-content?=false)
    copy-h2-to!(:embedded-pg, target-ds, legacy-h2)
    Files/move(legacy-h2.mv.db -> legacy-h2.mv.db.migrated-<ts>) ATOMIC_MOVE
    spit ".migrated-from-h2" sentinel into data-dir
    log/info "Migration complete in <ms>ms; <row-count> rows transferred."
  catch:
    log/error
    delete data-dir contents (so we don't half-init)
    leave legacy-h2 untouched
    System/exit 1
```

Key properties:
- **Atomic from the user's perspective**: H2 file is renamed only after PG transaction commits. Failure leaves H2 in place and the data dir empty.
- **Idempotent**: re-running just sees `PG_VERSION` and skips. Re-running after a manual rename-back of the H2 file would re-migrate; sentinel file lets us detect that case if desired.
- **No double-app-DB code**: at no point does Metabase have both H2 and embedded-PG set up as the *current* app DB. H2 is only opened by `copy/copy!` as a source data source via `cmd.copy.h2/h2-data-source`.
- **Transactional copy**: `copy.clj:457-463` already wraps inserts in a single transaction, rolled back on any failure.

### Edge cases

- **Encrypted H2 file (`MB_ENCRYPTION_SECRET_KEY`)**: `copy/copy!` reads encrypted bytes via JDBC and writes them to PG; the encrypted-at-rest property survives. The `check-encryption` step in `setup.clj:195` runs post-copy and validates the key matches. Add a test.
- **H2 file locked by another Metabase JVM**: H2's file lock will reject our open. Surface a clear error: "another Metabase instance has the H2 file open; shut it down before upgrading."
- **Multiple H2 files (legacy v1 `metabase.db.h2.db` + `metabase.db.mv.db`)**: the existing `update_h2.clj` upgrade flow handles v1→v2; we should run that *first* (it's already triggered in `data_source.clj:148`), then migrate to PG. Test ordering explicitly.
- **Disk space**: PG requires ~1.5–2× the source data dir during initial copy (transaction log + table data + indexes). Document this.

### Risks

- **Cold-start latency**: Zonky takes 1–3 s on first run (binary extraction), then ~0.3–0.8 s per restart. We currently lose ~0 s to H2. Benchmark on the PR.
- **Two Metabase processes pointing at same data dir**: H2 errors loudly with a file-lock exception today. PG refuses the second `pg_ctl start` with "is another postmaster running?". Same behavior, different error message — better UX overall (PG's lock is per-data-dir, self-cleans `postmaster.pid` more reliably).
- **Resource usage**: PG defaults are conservative but it does start a few backend processes and uses ~30–50 MB RAM idle. Acceptable.
- **Embedded-PG version skew**: If we upgrade Zonky from PG 18 → PG 19 in a future release, users' data dirs need a `pg_upgrade`. Zonky doesn't auto-handle this. **Pin the bundled PG major version and treat upgrades as a deliberate, infrequent operation** with its own migration tool. Bake hooks for this in Phase 1 — store the PG major version in the sentinel file alongside the data dir so we can detect a binary/data version mismatch.
- ~~**Alpine arm64 gap**~~ — resolved: Zonky ships `linux-arm64v8-alpine`. No Dockerfile change required.
- **Liquibase consolidation churn**: `setup.clj:88` consolidates changesets at startup. We've never tested this against a fresh embedded-PG instance with all of Metabase's history; verify with a full migration replay test.
- **H2-specific changesets ignored**: changesets gated `dbms: h2` are skipped on PG. None should be data-modifying except the H2 ones in `instance_analytics_views/` — verify there's no PG side that needs a parallel write. Quick grep: every `dbms: h2` block in `migrations/061/` is paired with a `dbms: postgresql,mysql,mariadb` block.

### Rollback plan per phase

- **Phase 1 (opt-in)**: no rollback needed — feature flag is `MB_DB_TYPE`.
- **Phase 2 (auto-migrate)**: rollback = restore `metabase.db.mv.db` from the `.pre-embedded-pg-backup`, downgrade JAR. Documented in release notes.
- **Phase 3 (default flip)**: rollback = users explicitly set `MB_DB_TYPE=h2` to keep old behavior. H2 stays wired up as an app DB through Phase 3.
- **Phase 4 (drop H2)**: no rollback — by this point auto-migration has been the default for 1–2 majors.

### Critical files for implementation

- `src/metabase/app_db/env.clj` — env resolution, default db-type, auto-migration trigger point
- `src/metabase/cmd/copy.clj` — copy engine; already handles `:h2 → :postgres`
- `src/metabase/app_db/connection.clj` — db-type validation and quoting-style; needs `:embedded-pg` plumbing
- `src/metabase/cmd/load_from_h2.clj` — extract `copy-h2-to!` helper from this for reuse at startup
- `test/metabase/test/embedded_postgres/core.clj` — promote to `src/metabase/app_db/embedded_pg.clj` as the production server lifecycle
- `deps.edn` — promote Zonky deps from `:dev`, add Alpine binary classifiers
- `Dockerfile` — verify behavior on linux/arm64; no change required if `linux-arm64v8-alpine` is in the bundle
