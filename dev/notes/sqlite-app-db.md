# SQLite app DB for dev previews

This branch runs Metabase with a local SQLite application database. An isolated instance passed HTTP setup and login, user lookup, collection/dashboard creation, saving and running a question returning `42`, search, and attaching the question to a dashboard. These checks exercised the fixes for typed timestamp reads, `NOW()` translation, and session date arithmetic. A process restart retained the authenticated session, question, dashboard contents, and search results. The Examples collection lists all 40 items, and a seeded dashboard question returned 28 rows. Broader feature coverage, concurrent sync, and durability testing are still in progress.

With your usual `$ALIASES` and development prerequisites, launch the REPL:

```sh
MB_JETTY_PORT=3055 \
MB_DB_TYPE=sqlite \
MB_DB_CONNECTION_URI=jdbc:sqlite:metabase-preview.sqlite \
clj -J"$(llm-repl 6006)" -M:"$ALIASES":build:build-dev:llm-repl
```

This opens the REPL without starting Metabase. Start the app as usual:

```clojure
(dev)
(start!)
```

`metabase-preview.sqlite` is relative to the working directory. Choose a fresh filename for a new preview, or use an absolute path. Keep your usual frontend development workflow. Check backend readiness with:

```sh
curl http://localhost:3055/api/health
```

The equivalent JVM settings are `-Dmb.db.type=sqlite` and `-Dmb.db.connection.uri=jdbc:sqlite:/absolute/file.db`. Set them before starting the JVM. Restart with the same file to retain the preview; choose a new file for an independent preview. Run exactly one Metabase process per file. Process exclusion is not yet enforced.

What this enables:

- **Migrations:** one known-good v65 baseline with schema, constraints, public seed content, Quartz tables, and current analytics views. Historical migrations do not replay. Subsequent schema/data migrations follow the shared Liquibase path and need SQLite-compatible implementations where required. Downgrades below v65 are rejected. See the [baseline documentation](../../resources/sqlite/README.md).
- **Scheduling:** persistent Quartz remains enabled, using nonclustered configuration and in-process Quartz locks.
- **Search:** the SQLite app DB search implementation uses substring matching. FTS5 is a follow-up.
- **Reads:** SQLite app DB results are buffered before downstream processing, allowing reducers and model hooks to write without holding a stale read snapshot. Large app DB reads therefore use more memory; warehouse streaming is unchanged.
- **Connections:** WAL mode, foreign keys enabled, `synchronous=FULL`, a five-second busy timeout, and `IMMEDIATE` write transactions. Timestamps use UTC text with six fractional digits.

Litestream replication and restore through S3 have **not been tested**. That round trip remains the next persistence milestone. For a simple local file copy, stop Metabase first so there are no concurrent writes. An abrupt stop during migration may leave Liquibase's lock flag requiring explicit recovery.

The [implementation plan](sqlite-app-db-plan.md) tracks the remaining subsystem, contention, restore, and feature checks.
