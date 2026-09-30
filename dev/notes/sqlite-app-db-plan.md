# SQLite application database implementation plan

Implementation in progress, 2026-09-24. An isolated SQLite-backed `core/init!` now completes and `/api/health` returns OK. The branch includes a v65 baseline, core app DB support, persistent nonclustered Quartz, and substring search. See [dev launch instructions](sqlite-app-db.md). Litestream replication/restore through S3 and broader feature/durability validation remain outstanding.

Target: a dev/preview-instance primitive that runs without Postgres and replicates its SQLite WAL to S3 through Litestream. Full subsystem compatibility is preferred, with explicit subsystem-off modes and disposable, versioned databases acceptable. The sections below track intended scope, follow-up work, and validation gates.

## Recommended preview scope and decisions

Build the SQLite storage foundation once, then expose independent capabilities. Prefer existing behavior where inexpensive; do not block a useful preview instance on Quartz, indexed search, historical migrations, or production qualification.

| Area | Preferred compatibility path | Acceptable preview fallback |
| --- | --- | --- |
| Core app DB queries | Correct SQLite/Toucan behavior | Required; cannot switch off |
| Schema/migrations | Liquibase-managed v64/v65 SQLite baseline, then normal upgrades | No historical replay required |
| Scheduler | Persistent Quartz on SQLite | Truly skip Quartz initialization and task registration |
| MQ | Existing durable queue semantics | Existing memory backend; pending work may disappear on restart |
| Search | SQLite appdb engine, eventually FTS5 | Existing in-place engine if its queries port cheaply, otherwise explicit search-off mode |
| Background sync | Existing scheduled jobs | Explicit bootstrap/manual sync, or pre-seeded warehouse metadata |
| State persistence | Local SQLite plus Litestream | Required for this use case; bounded asynchronous replication lag is acceptable |
| Cross-version data reuse | Migrate an existing preview from the SQLite baseline onward | Reject unsupported versions; explicitly recreate or fork if desired |

Keep backend selection separate from capability selection. The preview launcher can supply defaults for an opt-in SQLite preview profile; avoid sprinkling `if sqlite then disable feature` throughout the application. A preview for search or scheduling can enable those capabilities once implemented.

### First useful implementation sequence

1. **Compatibility probes and switches.** Try representative Liquibase operations and a minimal Quartz JDBC scheduler. Record blockers; full compatibility remains the preference, but unresolved Quartz support does not gate the preview path. Map startup side effects and implement genuine subsystem-off behavior.
2. **Core SQLite adapter.** Add env/spec/dialect/version support, connection pragmas, model type conversions, generated keys, transactions, and the SQL helpers needed by the preview smoke flow. Preserve the authorization and atomicity guarantees of features left enabled. Use the detailed query inventory below to expand coverage as failures surface.
3. **Repeatable schema setup.** Use Liquibase with a SQLite-specific baseline at v64 or v65, then run subsequent migrations normally. Recommend v65 in this checkout, with the exact included changesets fixed in the baseline manifest. A build-time generator may use an existing backend to establish the reference schema; launching a preview must not require Postgres. Include constraints, defaults, required seed state, Quartz/MQ tables, and current analytics views. Preserve connection verification and encryption initialization. Record a real baseline changeset rather than pretending historical migrations executed. Restored SQLite previews follow the same forward-upgrade path.
4. **Minimal preview boot.** Run with Quartz genuinely absent, MQ memory-backed, and search in-place or off. Complete setup/login, connect to a warehouse or use sample data, obtain metadata through an explicit sync/bootstrap path, save and run questions/dashboards, and reopen the file. Prove disabled subsystems cause no JDBC job-store or index DDL access.
5. **Litestream lifecycle.** Restore or initialize the file before Metabase opens it, start replication, run the preview, then stop app writes and allow replication to drain before teardown. Demonstrate a round trip through S3 to a fresh preview with edited content intact.
6. **Expand fidelity.** Enable in-place search, then indexed search; add Liquibase evolution and persistent Quartz as independent improvements. Retain off modes for previews that do not need them. Add targeted regression tests for each supported capability combination.

First milestone: start without Postgres, edit a question/dashboard, execute a warehouse query, replicate state, destroy the local preview, restore into a fresh preview, and see the same saved content. No persistent scheduler or FTS index is required for that milestone.

### Subsystem-off implementation details discovered in this checkout

- `MB_DISABLE_SCHEDULER` currently means **initialized in standby**, not absent. `task/impl.clj:init-scheduler!` still initializes the JDBC store, cleans up stored jobs, and registers tasks. Add an explicit no-initialization capability and cover the startup call sites; do not silently change the existing standby contract for other users.
- Most task helpers already tolerate a nil scheduler, but audit direct scheduler users, admin endpoints, and task initialization side effects. Disabled scheduled features must return an intelligible unavailable state rather than success for work that will never run.
- MQ already has a `memory` backend, and its documented default follows scheduler disablement. Wire the new absence mode into backend resolution; audit transaction/outbox hooks and recovery so the memory path does not accidentally execute SQLite-incompatible durable-recovery SQL. Ensure startup events and required asynchronous preview work still run.
- Search already has an index-free `in-place` engine. Start there if cheap, after testing SQL and permissions on SQLite. `search/init.clj` loads indexed engines and task registration too, so engine selection alone is not proof those side effects are absent. A true off mode must guard indexing producers/consumers, startup waits, settings changes, API calls, and relevant UI states.
- Turning off the scheduler also removes automatic warehouse metadata sync. Supply an explicit sync command/action or a seed with matching metadata so a preview remains useful for querying.
- Keep enabled-feature concurrency correct even in a dev instance. Multiple request threads can race on one process. Defer unused enterprise features by capability rather than weakening OAuth, permissions, or transaction behavior globally.

### Litestream integration contract

- Pin the Litestream version and use its matching configuration/CLI. Keep replication outside the JDBC adapter; Metabase writes local SQLite and Litestream handles S3.
- Restore before opening the app DB. Distinguish a missing replica from an authentication/network/restore error; only a genuinely new preview should initialize blank state. Never restore over an open DB or reuse stale sidecars.
- Give every writable preview/fork its own S3 prefix. A shared seed may be read by many previews, but only one active replication writer owns each destination. Use preview/schema identity in metadata to prevent opening an incompatible restored schema.
- Use WAL, per-connection foreign keys, and a busy timeout. Coordinate checkpoint ownership with the pinned Litestream version; if disabling app autocheckpoints, monitor WAL growth and define behavior when Litestream is down. Do not use SQLite exclusive locking to enforce one Metabase process, since Litestream needs its own connection.
- Treat S3 persistence as asynchronous. Track replica progress; on planned shutdown stop Metabase writes first and let Litestream sync before terminating it. On abrupt loss, the restored DB contains only successfully replicated state. See [Litestream caveats](https://litestream.io/tips/).
- Test local restart, fresh-host S3 restore, forced termination, S3 unavailability, migrations while replicating, and fork isolation. Run integrity/foreign-key checks on restored fixtures and verify saved content through the app.
- Use a SQLite build containing the WAL-reset fix before enabling multiple app/Litestream connections; the checked-in version predates it. Detailed dependency notes appear below.

### Scope of the detailed workstreams below

The remaining sections are the compatibility inventory and the path toward full compliance. Production qualification and broad enterprise parity are not prerequisites for the dev/preview milestone. The chosen migration approach is a Liquibase-managed v64/v65 baseline with subsequent migrations; translating older migration history is out of scope. Keep Quartz enabled if the single-instance adapter succeeds. Memory queues/subsystem-off modes remain fallbacks for concrete blockers, rather than the preferred outcome. Analytics views are included unless inspection reveals a meaningful cost to supporting them.

## Findings from this checkout

- `deps.edn` already ships `org.xerial/sqlite-jdbc` 3.50.3.0 in core for the Sample Database. No warehouse plugin should be required to bootstrap the app DB.
- `app_db/env.clj`, `spec.clj`, `connection.clj`, `setup.clj`, and `db.clj` assume H2, MySQL, or Postgres. SQL formatting, JDBC conversions, and date helpers also need explicit support.
- `resources/liquibase.yaml` supplies database-specific type properties. The initial migration selects one of three SQL snapshots; none is SQLite. Subsequent migrations include foreign-key additions, type changes, database-specific SQL, and Clojure data migrations.
- Search has a useful extension point in `search/appdb/specialization/api.clj`, but its supported DB set is currently Postgres/H2. `search/db.clj` also queries `information_schema.tables` and uses row locks.
- Quartz uses a persistent JDBC job store, a separate pool, and clustered configuration. MQ adds durable outbox recovery and custom Quartz delegates.
- Row-lock assumptions extend beyond `app_db/cluster_lock.clj`: OAuth authorization-code consumption, MFA, revisions, cache configuration, conversations, run tracking, search metadata, explorations, remote sync, and outbox recovery need review.
- App DB type dispatch appears across 68 source files under the patterns inspected. Treat that as an inventory starting point, not a complete compatibility audit.
- Existing uncommitted parameterized-query work precompiles ANSI/MySQL/H2 dialects. Coordinate with it; do not overwrite it.

Read-only inspection and isolated `jdbc:sqlite::memory:` probes used the supplied socket REPL on port 6006. The running application's DB was Postgres and was not rebound or migrated. Probe results:

| Probe | Result |
| --- | --- |
| Native SQLite version | 3.50.3 |
| FTS5 virtual-table creation | Works |
| Default `PRAGMA foreign_keys` | 0 |
| `SELECT ... FOR UPDATE` | Syntax error |
| `ALTER TABLE ... ALTER COLUMN ... TYPE` | Syntax error |
| Liquibase database detection | `sqlite` |
| Liquibase add-foreign-key SQL generator | Unsupported |
| JDBC binding of an OffsetDateTime | Stored as ISO text |
| JDBC boolean binding | Stored as integer 1 |

These probes do not establish Toucan round-trip compatibility, pooled concurrency, successful migrations, or scheduler support.

## 1. Full-compliance feasibility experiments

Before committing to full subsystem compatibility, produce disposable-file integration experiments for migrations and persistent scheduling. Use a separate test process for startup/global settings; keep the supplied running application intact. Unresolved scheduling blockers select the preview fallback rather than stopping core SQLite work.

**Migration experiment:** inventory changes by operation, DB restriction, raw SQL, custom migration, rollback, and precondition. Validate representative create/alter/constraint/data migrations against the pinned JDBC/Liquibase versions. Exercise Liquibase lock-service selection, interruption, rerun, and migration-history inspection.

**Scheduling experiment:** run a real Quartz JDBC job store against SQLite with a single scheduler, suitable lock handling, and the existing secure/MQ delegate behavior. Demonstrate schedule, execute, restart, recover, and concurrent app writes. Include the case where application code holding a write transaction invokes scheduler work on its separate connection: separate pools cannot solve a database-wide writer conflict.

Deliverables: executable probes, blocker inventory, and a recorded decision on migration history and scheduler architecture. For full compliance, persistent jobs, secure deserialization, and durable outbox semantics are acceptance requirements. The preview mode explicitly permits non-durable memory queues or an absent scheduler; report those capabilities accurately.

## 2. Connection and storage contract

Primary files: `src/metabase/app_db/{env,spec,data_source,connection,connection_pool_setup,setup,format}.clj`, config definitions, `deps.edn`.

- Add SQLite to configuration validation, URI inference, connection specifications, version checks, application DB construction, and formatting/dialect selection. Define exact file-path behavior and precedence of `MB_DB_CONNECTION_URI` over `MB_DB_FILE`.
- Select a JDBC release whose bundled SQLite includes the WAL-reset fix. The checked-in 3.50.3 does not; upstream lists fixes in 3.51.3 and later, with a 3.50.7 backport. Verify the actual native version in the packaged application, not just the Maven coordinate. See [SQLite WAL documentation](https://www.sqlite.org/wal.html#walreset).
- Enable and verify WAL at database initialization. Initialize `foreign_keys=ON`, bounded busy timeout, and the selected durability policy on every physical connection, including migration and scheduler connections. Start with `synchronous=FULL`; benchmark any proposed relaxation explicitly.
- Use a bounded pool sized from contention measurements. Define how write transactions begin, how cancellation works, and what happens when busy timeouts expire.
- Enforce one Metabase process per app DB through a process-ownership mechanism covering the server and offline maintenance commands. SQLite permits multiple processes; this is a Metabase support boundary needed for in-process coordination.
- Use local persistent storage. Document writable parent-directory requirements, sidecar files, checkpoint behavior, and clean shutdown. WAL requires same-host shared memory and still permits only one writer at a time. See [WAL concurrency](https://www.sqlite.org/wal.html).
- Default integration tests to temporary files. Plain `:memory:` databases are connection-local; do not accidentally create separate databases for pooled connections.

Exit: configuration, bootstrap, pool initialization, reopen, and second-process exclusion tests pass in source and packaged builds.

## 3. Migrations and schema evolution

Primary files: `resources/liquibase.yaml`, `resources/migrations/`, `src/metabase/app_db/liquibase.clj`, `custom_migrations*`, schema migration tests.

Follow-up inventory of forward `changes` entries in YAML under `resources/migrations` (excludes rollback/precondition SQL; counts include alternative DB branches, not independent migrations):

| Entry | Count / initial classification |
| --- | --- |
| Inline `sql` | 246: 200 DML, 38 DDL, 8 other by lexical classification |
| `sqlFile` references | 202: 174 analytics-view references, 3 initialization snapshots, 25 other references |
| `customChange` | 52 |
| `addForeignKeyConstraint` | 156 |
| `addNotNullConstraint` | 66 |
| `modifyDataType` | 52 |
| `addUniqueConstraint` | 52 |

The user's intuition is largely correct for inline SQL: most is data manipulation. It is not enough to skip all literal SQL. Counterexamples include generated `data_permissions.unique_perms_helper` columns (v58), indexes, initial schema snapshots, analytics views, and seed inserts such as the Trash collection and settings. Even data-only changes can establish required state on a fresh installation. The other SQL files largely concern permissions, Trash, and cache configuration and need individual inspection.

Skipping historical backfills is reasonable only for an explicit fresh/current-schema baseline whose required seed state is verified. Empty source tables do not make incompatible SQL valid: the database still parses/resolves statements. Existing SQLite previews restored from S3 require applicable data migrations on upgrade, or the explicit schema-mismatch/rebuild policy. Classify changes as portable, obsolete backfill, required seed, required schema, or optional-subsystem schema; add explicit SQLite routing rather than a blanket SQL/custom-change filter.

Liquibase recognizes SQLite, but schema change support is incomplete. The installed-version probe already found `addForeignKeyConstraint` unsupported; upstream also lists [addNotNullConstraint](https://docs.liquibase.com/secure/reference-guide-5-1/change-types/addnotnullconstraint) as unsupported. These structured changes can require table rebuilds just as literal DDL can. Counts above are an audit inventory, not a claim that every instance will execute or fail on SQLite.

Decision: introduce a SQLite schema baseline at v64 or v65 and apply subsequent migrations through an explicit SQLite changelog route. Recommend v65 for this checkout; pin the precise revision and included changeset set, since a release number alone does not define a stable boundary while that release is under development. This avoids translating historical data transformations for SQLite installations that never existed. Retain the existing historical route for existing backends.

- Produce a reviewed SQLite baseline containing tables, indexes, defaults, constraints, required seed state, and Quartz/MQ tables. Compare normalized schema invariants with an existing backend at the same release; a textual SQL conversion is insufficient.
- Specify baseline/version metadata and changelog selection before implementation. Audit version detection, rollback selection, migration force/recovery commands, and checksum handling. Do not fabricate historical execution records or broadly mark unsupported changes as run.
- Freeze the baseline once published. Explicitly define the shared migration tail, including migrations added later to an older release directory; selecting solely by a `v65` prefix or timestamp risks skipping late/backported changes. Test that fresh creation and baseline-plus-upgrade converge on equivalent schema and required data. Resolve future `changeSetExecuted` preconditions that refer to pre-baseline history using baseline-aware conditions.
- Include the current analytics-view definitions at the baseline rather than porting every historical revision. Inspect the final views selected by the changelog, not just the highest-numbered file in each directory. Port SQLite-specific syntax and test view creation plus representative reads; also check audit-app engine/schema wiring. For example, the current H2 tasks view uses `DROP VIEW IF EXISTS` followed by `CREATE OR REPLACE VIEW`; its query is largely straightforward, and the replace syntax is an adapter task. JSON/date expressions in other views require separate inspection. Only defer a view/subsystem if its actual dependency or SQL cost warrants it.
- Older H2/Postgres/MySQL sources must first reach the supported release on their original engine, then use a data-copy path into the SQLite baseline. Their old Liquibase history must not be copied blindly.
- Define canonical timestamp, boolean, JSON/text, BLOB, and generated-ID representations before generating the baseline. `INTEGER PRIMARY KEY` and explicit-ID imports need deliberate treatment, including whether IDs may ever be reused.
- For future schema changes, use portable operations where possible and explicit SQLite migrations otherwise. Build a tested table-rebuild helper for unsupported alterations: preserve data, indexes, triggers, foreign keys, defaults, and ID behavior, with atomic recovery and integrity checks. SQLite documents a generalized rebuild procedure in [ALTER TABLE](https://www.sqlite.org/lang_altertable.html).
- Foreign-key toggles must occur at the correct connection/transaction boundary. Run `foreign_key_check` after rebuilds/imports and verify enforcement remains enabled. See [foreign-key behavior](https://www.sqlite.org/foreignkeys.html).
- Add SQLite implementations for required custom migrations, metadata introspection, timestamp helpers, and migration locking. Avoid backend fallthrough into H2 behavior.
- Define downgrade support starting at the first SQLite release; reject attempts to downgrade into a release without SQLite support. Test supported rollback operations explicitly.

Do not port the pre-baseline migration chain. Use its resulting schema and required seed state as reference material. New SQLite-compatible data migrations remain necessary when upgrading populated previews after the baseline.

Exit: fresh install, restart without changes, upgrade from every supported SQLite fixture, failed-migration recovery, and supported downgrade pass; other backends retain valid migration histories/checksums.

## 4. Querying, types, and transactions

Primary files: `app_db/{connection,setup,jdbc_protocols,query,db,sql_errors,transient_error,query_cancelation}.clj`, `util/honey_sql_2.clj`, model transforms, feature DB namespaces.

- Choose an explicit HoneySQL dialect policy. ANSI quoting may be reusable, but generated DML, conflict clauses, returning/generated keys, pagination, and SQLite functions need contract tests. Incorporate the local parameterized-query changes once their API is settled.
- Implement consistent read/write conversions for temporal values, booleans, JSON, binary values, nulls, and IDs across both JDBC APIs and Toucan. Test timestamps with offsets, fractional precision, comparisons, defaults, and expressions as well as bare columns. Fix the schema/storage format before relying on lexical timestamp ordering.
- Implement current time, date arithmetic, intervals, string operations, casts, metadata discovery, and upserts. Audit raw SQL and every app-DB dispatch, including enterprise namespaces.
- Verify single and bulk inserts return the correct IDs/instances, including mixed insert/update upserts and explicit IDs. Respect SQLite parameter limits by chunking bulk operations.
- Replace row-lock-dependent operations with an explicit concurrency strategy: short write transactions, conditional atomic updates, or scoped in-process locks as appropriate. Test each caller's guarantee; globally removing `FOR UPDATE` is unsafe.
- Generalize the H2 in-process cluster-lock mechanism only after enforcing the single-process boundary. Preserve shared/exclusive semantics, timeout/cancellation, reentrancy, transaction lifetime, and detached-lock behavior.
- Establish transaction modes at transaction entry, including how read-then-write operations obtain a writer reservation. Do not issue a nested `BEGIN IMMEDIATE` inside an existing JDBC transaction.
- Classify SQLite busy/locked/constraint/cancellation errors and extended result codes. Retry only safe transaction boundaries with bounded backoff; a statement retry cannot generally repair a stale snapshot. Preserve savepoints, rollback, before/after-commit hooks, and side-effect ordering.
- Inspect writes followed by work on another connection throughout the application. Avoid holding a writer transaction while waiting for scheduler or background work that needs to write.

Exit: app DB contract tests and representative permission, OAuth/MFA, revision, cache, and queue race tests pass with multiple connections.

## 5. Durable background work

Primary files: `resources/quartz.properties`, `app_db/quartz.clj`, `task/{bootstrap,impl,secure_delegate*}.clj`, `mq/queue/{quartz,outbox}.clj`, affinity delegates.

Follow-up investigation: single-instance Quartz looks feasible with a small adapter. Prefer keeping it enabled if the end-to-end spike succeeds.

- The running REPL uses Quartz 2.3.2. Inspection of that jar's `JobStoreSupport.initialize` confirms that `isClustered=false` and `useDBLocks=false`, with no explicit lock-handler override, select the built-in `SimpleSemaphore` for in-process synchronization. Keep `JobStoreTX` persistence and `acquireTriggersWithinLock=true`. This removes the need for cross-instance Quartz row locks without removing coordination among scheduler threads.
- An isolated in-memory SQLite probe successfully created all 11 tables using the bundled HSQLDB schema's CREATE statements, with foreign keys enabled; inserted and read a job with serialized data; inserted and read a simple trigger; and selected that trigger for acquisition. This is evidence for SQL/JDBC feasibility, not a complete scheduler test or a reviewed production schema.
- The probe required overriding `StdJDBCDelegate.getObjectFromBlob` to use the existing allowlisted byte-array reader. SQLite JDBC's `getBlob` throws "not implemented by SQLite JDBC driver"; `getBytes` works. Apply this to the effective delegate, including MQ affinity, and audit calendar/blob-trigger paths separately.
- The stock `UpdateLockRowSemaphore` also acquired a lock successfully in the probe, so it is an alternative if needed. In-process locking is the simpler first choice for the stated single-instance scope.
- Remaining proof: actual execution, recurring/cron triggers, completion, misfires, restart recovery, and concurrent writes using multiple connections to a temporary file. Test the existing MQ acquisition rewrite too. A single-connection delegate probe does not exercise these paths.
- In-process Quartz locks do not coordinate arbitrary app DB transactions or Litestream. Keep SQLite busy handling and transaction-boundary tests. In particular, an app write transaction must not synchronously wait for Quartz to write through a second connection to the same file; move such work after commit or through the existing outbox mechanism where appropriate.

- Implement the scheduler architecture proven in step 1. Set SQLite-specific non-clustered configuration and compatible lock acquisition; merely setting `isClustered=false` does not establish SQL compatibility.
- Preserve secure BLOB deserialization and MQ delegate behavior, including AOT packaging.
- Replace outbox claim/locking SQL with SQLite-compatible atomic behavior. Preserve commit-before-publish, bounded batches, crash recovery, and existing duplicate-delivery semantics.
- Test sync/scan, subscriptions, alerts, cache refresh, search indexing, and queue recovery during concurrent request writes, clean restart, and forced termination.

Exit: schedules and queued work survive restart with no lost committed outbox messages; contention remains bounded and recovery is observable.

## 6. Search

Primary files: `search/appdb/specialization/sqlite.clj` (new), specialization registration, `search/appdb/{core,index,query}.clj`, `search/db.clj`.

- First implement a correct SQLite appdb specialization using normalized text matching, based on the existing H2 behavior where appropriate. Preserve the shared permissions/filtering/ranking pipeline, but use SQLite DDL/upserts. This provides a functional milestone without making FTS syntax part of every bootstrap failure.
- Replace `information_schema` discovery with SQLite metadata queries, filter internal/FTS shadow tables, and implement index lifecycle, upserts, cleanup, metadata locking, and row-count statistics.
- Implement all specialization methods, including schema, query construction, text score, extra fields, percentile statistics, and size estimates. Audit query disjunction handling and engine capability gates.
- Then add FTS5 as the intended indexed implementation. Keep a stable row ID linking search documents to FTS entries; choose a single transactional synchronization mechanism and test insert/update/delete/rebuild consistency. See [FTS5 external-content tables](https://www.sqlite.org/fts5.html#external_content_tables).
- Translate user input into safe FTS expressions rather than exposing raw MATCH syntax. Specify punctuation, quotes, prefixes, Unicode, tokenization, empty input, and native SQL text behavior. Parameter binding alone does not make arbitrary MATCH syntax valid.
- Adapt FTS relevance scores to the existing ranking direction/scale. Preserve permission filtering before limits, pagination, counts, archived/personal/tenant visibility, and exact-name boosts. Do not promise Postgres stemming parity.
- Test incremental indexing, online rebuild/swap, restart, deletion, fallback, and updates arriving during rebuild. Bound batch duration so indexing does not monopolize the writer.
- Verify semantic-search capability/dependency detection on SQLite and explicitly gate any unavailable enterprise features.

Exit: search API/permission tests pass; FTS and fallback behavior are specified and measured on realistic document counts.

## 7. Import, backup, and feature coverage

- Extend `cmd/copy.clj` and relevant command entry points for H2-to-SQLite and SQLite-to-Postgres migration, preserving IDs, JSON, timestamps, encrypted settings, constraints, and generated-ID continuity. Preserve the source and verify destination counts/integrity before use.
- Define how derived search data and scheduler state are copied or reconstructed. Test destination startup, then creation of new entities.
- Provide supported stopped-instance backup/restore instructions and, if needed, a coordinated online backup command. Copying only a live main database file can lose committed WAL data; use a coherent backup mechanism. See [SQLite backup API](https://www.sqlite.org/backup.html).
- Audit enterprise audit-app wiring, analytics views, serialization/import/export, encryption/key rotation, usage logs, cache storage, remote sync, and task leases. Record supported/unsupported features explicitly; do not silently disable startup failures.
- Verify JDBC native-library loading in Docker and supported operating systems/architectures. Run Sample Database and warehouse SQLite regression tests when changing the shared JDBC dependency.

## 8. CI and release gates

- Add a SQLite app-DB test profile and CI matrix entries; these are separate from the existing SQLite warehouse driver tests. Exercise OSS and enterprise app-DB groups and remove hardcoded H2/Postgres fixture assumptions.
- Keep representative on-disk databases from each supported SQLite release for upgrade testing. Verify schema constraints, migration history, and application behavior after each upgrade.
- Run existing app-DB, model/API, search, task/MQ, encryption, copy, and migration suites. Include packaged startup and setup/login/create-query-dashboard/restart smoke tests.
- Add targeted multi-connection/process tests for writer contention, read-to-write promotion, pool exhaustion, migration interruption, process exclusion, and abrupt shutdown. Assert integrity and behavioral guarantees, not just successful SQL execution.
- Benchmark concurrent requests with sync, indexing, queue recovery, and cache writes. Set release thresholds for request latency, busy-error rate, writer wait time, checkpoint progress/WAL growth, and job delay based on the intended deployment size.
- Release behind opt-in configuration first. Production support requires all durability/upgrade/concurrency gates; changing the default or automatically converting existing H2 installations is a separate decision.

## Optional full-compliance change sequence

1. Feasibility probes and recorded migration/scheduler decisions.
2. Patched JDBC dependency, connection contract, and SQLite test harness.
3. Type/query/transaction primitives and schema baseline, split into reviewable dependent changes.
4. Portable schema evolution, migration tooling, and upgrade fixtures.
5. Lock-sensitive callers, persistent scheduler, and durable queue recovery.
6. Search compatibility, followed by FTS5 indexing and relevance tests.
7. Import/export, enterprise coverage, backup/restore, and packaged verification.
8. CI coverage, contention benchmarks, documentation, and opt-in release.

Full-compliance milestone: a disposable SQLite file can migrate, start Metabase, complete setup, save/query a question and dashboard, search authorized content, execute a persisted background job, and survive restart. This extends the earlier dev/preview milestone; production qualification is a separate scope decision.
