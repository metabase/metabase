# Semantic duplicate questions: implementation handoff

## Objective and scope

Add **Potential duplicates** to **Monitoring → Content management**, alongside Dependency diagnostics and Erroring questions. A background job finds semantically similar saved questions, persists canonical question pairs, and a paginated read API serves a table of questions and their potential duplicates.

This is a hackathon implementation. Keep it small; the user previously requested no automated tests. Do not implement merging, deletion, dismissals, confidence percentages, or a settings UI. Perform the manual validation below. This document is a plan only; implement it in a subsequent task.

User requirements:

- Search using each question's title and description.
- Keep matches above a semantic similarity threshold.
- Store pairs in `semantic_duplicates`, with **exactly two columns**, `question_id_1` and `question_id_2`.
- Composite primary key on both columns and a database check constraint `question_id_1 < question_id_2`.
- Read pairs in ascending `question_id_1` order with bounded pagination.
- Group results in memory and show one row per question, with its directly matching questions.
- **Clarification received:** every edge is bidirectional in the display, including isolated pairs. For input `(a,b), (a,c), (b,c), (d,e), (g,h)`, output is:

```clojure
{a [b c], b [a c], c [a b], d [e], e [d], g [h], h [g]}
```

Do not compute connected components or transitive closure. If only `(a,b)` and `(b,c)` exist, do not invent an `(a,c)` match.

## Existing implementation and local environment

The preceding feature is already implemented in:

- `frontend/src/metabase/query_builder/components/view/sidebars/QuestionInfoSidebar/components/QuestionDuplicates.tsx`
- `frontend/src/metabase/query_builder/components/view/sidebars/QuestionInfoSidebar/QuestionInfoSidebar.tsx`
- `frontend/src/metabase-types/api/search.ts` (optional `scores` array on search results).

The Overview tab has a Duplicates card **after Fields and before Entity ID**. There is no question-page banner. Preserve this placement and behavior; replacing its live search with the new persisted API is not required for this task.

The sidebar currently:

1. Joins nonempty title and description with a newline.
2. Requests `GET /api/search`, `search_engine=semantic`, `models=[card]`, `archived=false`, `include_dashboard_questions=true`, `limit=100`.
3. Excludes the source question, filters `scores[name=semantic-distance].score >= 0.82`, orders by that score, and shows at most three links.

**Do not copy its 100-candidate/three-result caps into the global backfill.** This feature should find all qualifying pairs, not only the first page of blended-ranked search results.

Local setup, already working:

- Metabase: `http://localhost:3060`, development JVM with nREPL port recorded in `.nrepl-port`.
- App database: Postgres on port 5460, database `metabase`.
- Separate pgvector database: container `metabase-semantic-vectors`, localhost port 5461, database `metabase_semantic`, pgvector 0.8.6 / Postgres 17.
- Embeddings run **inside Metabase**, using `plugins/metabase-embedder-plugin.jar` built from `modules/embedder`.
- Provider `in-process`, model `Snowflake/snowflake-arctic-embed-xs`, 384 dimensions. No Ollama is needed or running.
- Semantic search is licensed and the default search engine; the initial index contained 1,376 searchable entities across all types.
- **`MB_DISABLE_SCHEDULER=true`.** A local helper maintains the semantic index only; it will not automatically run a new duplicates job. Do not enable the global scheduler: it would also enable unrelated jobs.
- Local setup notes and REPL helper: `local/semantic-search/README.md`, `local/semantic-search/repl.py`, `local/semantic-search/configure.clj`. These are local/ignored files and may not exist in another checkout. Do not copy credentials into source or this plan.
- The frontend dev server runs on port 8060 and supplies the page on 3060.
- Existing unrelated edits may be present, including `enterprise/backend/test/metabase_enterprise/metabot/tools/semantic_search_test.clj`. Preserve them.

## Source map to read before coding

### Background jobs and persistence

- `enterprise/backend/src/metabase_enterprise/dependencies/task/backfill.clj`: `task/defjob`, `DisallowConcurrentExecution`, scheduling, retry/reschedule, feature checks.
- `enterprise/backend/src/metabase_enterprise/dependencies/task/entity_check.clj`: similar asynchronous diagnostics lifecycle.
- `enterprise/backend/src/metabase_enterprise/dependencies/init.clj`: explicit namespace registration.
- `enterprise/backend/src/metabase_enterprise/semantic_search/init.clj`: register the new job here.
- `src/metabase/task/impl.clj`: scheduler lifecycle, disabled scheduler behavior.
- `src/metabase/app_db/cluster_lock.clj`: existing cross-node lock mechanism.
- `resources/migrations/060/20260402_dependency_status.yaml`: migration style.
- `resources/migrations/059_update_migrations.yaml`: examples of `addPrimaryKey`.
- Current migration directories extend through `resources/migrations/065/`. Confirm the active version and changelog discovery before adding a new migration; do not edit an already-applied changeset.

### Semantic search

- `enterprise/backend/src/metabase_enterprise/semantic_search/embedding.clj`: `get-configured-model`, `prefix-search-query`, `get-embedding`.
- `enterprise/backend/src/metabase_enterprise/semantic_search/env.clj`: `get-pgvector-datasource!`, `get-index-metadata`.
- `enterprise/backend/src/metabase_enterprise/semantic_search/index_metadata.clj`: `get-active-index-state` and the active embedding-space descriptor.
- `enterprise/backend/src/metabase_enterprise/semantic_search/index.clj`: vector schema and query conventions; `embedding`, `model`, `model_id`, `archived` columns.
- `enterprise/backend/src/metabase_enterprise/semantic_search/scoring.clj`: normalized similarity formula.
- `enterprise/backend/src/metabase_enterprise/semantic_search/core.clj`: hybrid search and fallback behavior.
- `enterprise/backend/src/metabase_enterprise/semantic_search/health.clj`: readiness checks.
- `enterprise/backend/src/metabase_enterprise/semantic_search/settings.clj`: internal setting conventions.

### API and Monitoring

- `enterprise/backend/src/metabase_enterprise/semantic_search/api.clj`: existing `/api/ee/semantic-search` API; currently includes `/status`.
- `enterprise/backend/src/metabase_enterprise/api_routes/routes.clj`: already mounts that namespace under the `:semantic-search` premium gate.
- `enterprise/backend/src/metabase_enterprise/dependencies/api.clj`: `/graph/unreferenced` pagination and hydrated response, `/backfill-status`.
- `enterprise/backend/src/metabase_enterprise/dependencies/db.clj`: diagnostics visibility predicates.
- `frontend/src/metabase/monitor/components/MonitorLayout/MonitorLayout.tsx`: sidebar items and `getActiveSection`.
- `frontend/src/metabase/monitor/routes.tsx`, `route-guards.tsx`.
- `frontend/src/metabase/common/monitor/selectors.ts`: diagnostics access means admin or data analyst, outside iframe.
- `frontend/src/metabase/plugins/oss/monitor.ts`: OSS-safe plugin slots.
- `enterprise/frontend/src/metabase-enterprise/monitor/dependency-diagnostics/index.ts`, `routes.tsx`, `components/DependencyDiagnostics.tsx`, `components/DiagnosticsTable/`: reference page wiring/table patterns.
- `enterprise/frontend/src/metabase-enterprise/plugins.ts`: enterprise plugin initialization.
- `enterprise/frontend/src/metabase-enterprise/api/dependencies.ts`: RTK Query endpoint style.
- `frontend/src/metabase/urls/monitor.ts`, `frontend/src/metabase/common/monitor/analytics.ts`, `frontend/src/metabase-types/analytics/event.ts`: URL and navigation integration (confirm exact URL helper location).

## 1. App database migration and model

Create `semantic_duplicates` in the **Metabase application database**, not the separate pgvector database. These are application records referring to `report_card` IDs; keeping them in the app DB enables joins, permissions, and normal migrations. The semantic vector schema/migration mechanism is separate.

Logical schema:

```sql
CREATE TABLE semantic_duplicates (
  question_id_1 INTEGER NOT NULL,
  question_id_2 INTEGER NOT NULL,
  CONSTRAINT pk_semantic_duplicates PRIMARY KEY (question_id_1, question_id_2),
  CONSTRAINT chk_semantic_duplicates_order CHECK (question_id_1 < question_id_2),
  CONSTRAINT fk_semantic_duplicates_question_1
    FOREIGN KEY (question_id_1) REFERENCES report_card(id) ON DELETE CASCADE,
  CONSTRAINT fk_semantic_duplicates_question_2
    FOREIGN KEY (question_id_2) REFERENCES report_card(id) ON DELETE CASCADE
);
CREATE INDEX idx_semantic_duplicates_question_2 ON semantic_duplicates(question_id_2);
```

Use Liquibase conventions, suitable names/quoting, and explicit rollback for custom SQL. Confirm CHECK syntax/enforcement on the supported app DBs (Postgres, H2, MySQL/MariaDB); use DB-specific SQL changes where necessary, not a Liquibase Pro-only change type. The canonical order must be enforced by the database, not just Clojure.

Do not add an `id`, score, timestamps, or run-state column. Put optional lifecycle status in a separate internal setting, not in this table. If introducing a Toucan model (suggested `:model/SemanticDuplicate` in `semantic_search/models/semantic_duplicate.clj`), declare the composite primary keys explicitly. Simple HoneySQL over the table is also acceptable and avoids assumptions that every model has an `id`.

Centralize canonicalization as `[min(source,target), max(source,target)]`, reject self-pairs, and deduplicate pairs before bulk insert.

## 2. Pure semantic matching helper

Suggested new namespace: `metabase-enterprise.semantic-search.duplicates`.

Use threshold **0.82** initially, matching the existing sidebar. Define a named backend constant (or a validated internal setting with default 0.82). Keep the sidebar constant aligned/documented; a user-facing configuration screen is unnecessary.

The score is:

```text
similarity = 1 - cosine_distance / 2
qualifies when similarity >= 0.82
           equivalently cosine_distance <= 0.36
```

This is not 82% confidence and is not the total weighted search score or RRF. Do not filter by `:contribution`.

For each eligible source card:

- `report_card.type = 'question'`, not archived, with nonblank title/description. Include saved dashboard questions, matching the sidebar's scope; exclude models, metrics, transient cards and other entity types.
- Build exactly `join("\n", nonblank(title, description))` and trim it.
- Resolve the active index and its model descriptor. Apply `embedding/prefix-search-query` once, then call `embedding/get-embedding` using the compatible configured model. Reuse provider preparation/token accounting conventions; do not hardcode an API key, model name, dimension, or developer user ID.
- Query the active vector table for model `card`, nonarchived rows, excluding the source card, and apply the distance predicate **inside SQL**.
- Prefer exact/brute-force distance evaluation for this hackathon feature. An approximate HNSW top-k result set cannot promise every pair above threshold. Put a reusable vector-threshold query helper beside the existing index queries, rather than implementing embedding math in the job.
- Parameterize the vector and values; derive/quote table identifiers through existing index helpers. Do not interpolate user text or hardcode the current generated index table name.
- Stream/page qualifying IDs instead of applying a top-100/top-1000 cap. Vector `model_id` is text: convert safely and revalidate target IDs against live eligible `report_card` rows in the app DB. There is no cross-database SQL join.
- The indexed target embedding represents Metabase's searchable document, not exclusively its title/description. This intentionally matches the prior feature: source text is title/description; targets are the existing semantic index. A symmetric title-only embedding index is out of scope.

A semantic match can be directional because source queries and indexed documents differ. Store the undirected pair if **either source direction** qualifies. Therefore scan every eligible source; do not only search for larger target IDs. Canonicalization handles persistence afterward.

Do not use HTTP `/api/search` from the job. The public search pipeline applies user-specific ranking, candidate caps, and fallback; using it naïvely can omit matches or record keyword results. The internal background matcher must fail/retry on an unavailable embedder/index, not interpret failure as an empty successful scan. The existing `engine` label alone does not prove fallback did not happen.

## 3. Asynchronous backfill lifecycle

Suggested new file: `semantic_search/task/duplicates_backfill.clj`, explicitly required from `semantic_search/init.clj`.

Minimum hackathon design: one Quartz `DisallowConcurrentExecution` job that performs a complete pass, fetching source cards in keyset batches of 25–50 (`id > last_id ORDER BY id`). Do all embedding/search work outside app DB transactions. Provide a synchronous worker `backfill!` and a nonblocking `trigger-backfill!` for startup, manual triggering, and local REPL use.

For a small instance, accumulate canonical pairs in an in-memory set and publish the complete new result in one short app DB transaction (delete old pairs, then insert the new set in bounded bulk chunks). Benefits: a mid-scan failure keeps the previous successful snapshot; reruns remove obsolete matches; either-direction matches survive regardless of processing order. Do **not** delete all incident pairs after each source scan: the reverse-direction scan might legitimately produce a different result.

This full-pass set is an explicit hackathon tradeoff, not a scalable production design. Worst-case output is quadratic. Do not serialize the pair set into Quartz JobDataMap. A production follow-up would use a staging generation/status table and resumable batches. In this version, interrupted scans restart from the beginning safely.

Lifecycle:

- Gate on the semantic-search entitlement, an active compatible index, and usable embedding provider. Wait for initial index population/catch-up before publishing a scan; a freshly created but empty vector table must not produce a successful empty duplicates snapshot. Register the job normally; unavailable infrastructure should cause a delayed retry, not permanent abandonment.
- Run asynchronously shortly after startup/index readiness; expose an admin-only manual rebuild trigger. A simple daily refresh is sufficient for ongoing changes in this hackathon version. Debounced card-change triggers are optional follow-up, not required infrastructure.
- Prevent simultaneous scans/publications using the existing clustered task/lock convention as appropriate. Repeated manual requests must not create concurrent jobs.
- Capture the embedding-space/index identity and threshold at the start. If they change during the scan, discard the partial result and retry. Do not mix vector spaces.
- On a source failure, abort the publication and retry with a delay; log the failed card ID and error without logging credentials. Propagate interruptions. A partially failed scan must not replace a good snapshot with missing results.
- Before publishing, re-filter IDs for deletion/archive/type changes. Foreign-key failures caused by concurrent deletion should roll back and retry rather than destroy the old snapshot.
- Update the successful snapshot revision in the same app DB transaction that publishes the pairs. Read the pair page, count, and revision from a consistent read transaction so concurrent publication cannot attach a new revision to old rows.
- Keep lightweight status in one internal JSON setting (e.g. `semantic-duplicates-backfill-status`): state, processed/total questions, last successful completion, last error, and an opaque snapshot revision. Persist progress per batch, not per question. On startup recover a stale `running` status as pending. Do not show raw exceptions to nonadmin callers.
- If no eligible questions exist, a successfully completed run publishes an empty table. This differs from an unavailable index or failed scan.

The GET listing endpoint must never run a semantic backfill inline.

### Local scheduler caveat

Normal Quartz wiring will not execute on the current local instance because its scheduler is disabled. After migration/loading the new code, run the worker asynchronously via nREPL, e.g. `(future (duplicates-backfill/backfill!))`, using the actual namespace/function implemented. Report completion/status and verify the database. Do not change `MB_DISABLE_SCHEDULER` or restart unrelated scheduler jobs to demo this feature. A manual trigger endpoint should enqueue only this work when using any explicit local development fallback; do not silently claim a disabled Quartz job has run.

## 4. Paginated API and bidirectional grouping

Extend the existing semantic-search API namespace, retaining its existing premium gate:

- `GET /api/ee/semantic-search/duplicates?limit=50&offset=0`
- `GET /api/ee/semantic-search/duplicates/status`
- `POST /api/ee/semantic-search/duplicates/backfill` (admin only; return 202/status, no synchronous scan).

For reads, allow the same admin/data-analyst audience as Monitoring diagnostics, and enforce permissions server-side. Inspect `api/check-data-analyst`/related helpers and existing diagnostics visibility rather than assuming a menu guard is authorization. Both endpoints of every returned pair must be visible to the caller. Apply equivalent visibility/archived/type filtering to the count and listing queries **before pagination**; do not leak invisible IDs, names, counts or collection information. For an explicitly admin-only simplification, change both route and backend gating together and document it; do not inadvertently expose everything to analysts.

Query canonical pairs with deterministic order:

```sql
ORDER BY question_id_1 ASC, question_id_2 ASC
LIMIT :limit OFFSET :offset
```

Default limit 50 pairs; maximum 200; offset must be nonnegative. `total`, `offset`, `limit`, and `pair_count` refer to **stored visible pairs**, not grouped question rows. The second sort key is required for stable page boundaries.

After fetching a page, build an adjacency map in backend memory:

```clojure
(reduce (fn [m {:keys [question_id_1 question_id_2]}]
          (-> m
              (update question_id_1 (fnil conj #{}) question_id_2)
              (update question_id_2 (fnil conj #{}) question_id_1)))
        {}
        pairs)
```

Batch-hydrate the distinct question IDs on this page (name, display type, and minimal collection metadata if displayed). Avoid one card API call/SQL query per row. Sort source rows by numeric question ID; sort/deduplicate each duplicate list. Return JSON arrays of typed rows, not a JSON object keyed by numeric IDs.

Suggested response:

```json
{
  "data": [
    {"question": {"id": 12, "name": "Sales"},
     "duplicates": [{"id": 19, "name": "Sales copy"}]},
    {"question": {"id": 19, "name": "Sales copy"},
     "duplicates": [{"id": 12, "name": "Sales"}]}
  ],
  "total": 125,
  "limit": 50,
  "offset": 0,
  "pair_count": 50,
  "snapshot_revision": "opaque-last-successful-run-id"
}
```

Do not return a score/confidence: the requested table deliberately does not store one. Do not run embeddings to enrich a listing response.

### Pagination semantics (important)

Pagination happens **before grouping**, as requested. A question may appear in multiple pair pages; a page's adjacency list is not necessarily that question's complete duplicate list. Implement a **Load more** UI that merges returned grouped rows by question ID and unions duplicate IDs across loaded pages. Offset advances by `pair_count` (or applied pair limit), never by `data.length`. A page of 50 pairs can produce up to 100 question rows.

Label progress as “Loaded X of Y duplicate pairs”; do not claim a complete per-question duplicate count until all pages are loaded. Newly fetched reverse edges may add duplicates to an already visible row. For example, after loading `(a,b)`, then `(a,c)`, row `a` must end up with `[b,c]`, not be replaced by `[c]` or displayed twice.

When a rebuild completes, the published snapshot can change the offset ordering. Compare `snapshot_revision`; clear the accumulated map and restart at offset zero when it changes. Disable duplicate in-flight Load more requests, and retain the next offset on retry. Do not prefetch the entire table just to hide pagination issues.

## 5. Monitoring frontend

Suggested files:

- `enterprise/frontend/src/metabase-enterprise/monitor/semantic-duplicates/` for page, table, grouping/merge utility, routes/plugin initializer.
- `enterprise/frontend/src/metabase-enterprise/api/semantic-duplicates.ts` for typed RTK Query endpoints; export through the existing API barrel.
- `frontend/src/metabase-types/api/semantic-duplicates.ts` for request/response/status types; export through its barrel.

Wire a lazy route `/monitor/semantic-duplicates` through the Monitor enterprise plugin pattern. Add `Potential duplicates` to Content management, alongside existing diagnostics/errors items. Extend `PLUGIN_MONITOR`, enterprise initialization, URL helper, route/access guard, and `getActiveSection`. If tracking the navigation click, update the actual analytics event union/schema rather than casting an invalid event value. Gate on semantic-search availability/licensing, not the unrelated dependencies or audit-app entitlement. Preserve OSS-safe imports.

Page/table:

- Use existing `MonitorMain`, `MonitorHeaderTitle`, and monitoring table styles.
- Columns: **Question** (link), **Potential duplicates** (list of links). Collection is optional; avoid duplicating expensive diagnostics filters/details panels.
- One row per question; reverse rows are intentional per the user's clarification.
- Merge page data as described above. Both row and duplicate links use `Urls.card({id, name})` and normal permissions-aware navigation.
- Show initial loading/error/retry; background analysis progress; successful-empty state; unavailable semantic-search state. While rebuilding, keep the previous successful snapshot visible and identify it as such.
- Offer admin-only “Recheck duplicates” wired to the async trigger; poll status while pending/running and reload the first page after success. Do not endlessly refetch result pages merely because the status endpoint was polled.
- Maintain the existing question Info → Overview Duplicates section. No duplicate banner on the main question page.

## 6. Implementation order and validation

1. Confirm working tree and active migration version. Add schema/model/query helpers.
2. Add the pure semantic threshold matcher and shared default threshold.
3. Add the background worker, atomic publication, status and job registration.
4. Add authorized paginated listing/status/trigger endpoints and in-memory adjacency expansion.
5. Add types, RTK Query, Monitor navigation/route/page/table and page merge behavior.
6. Migrate the local app DB through the normal migration runner; load/restart backend code as required. Run the local backfill asynchronously without enabling the global scheduler.
7. Validate manually; no new automated tests are required for this hackathon request.

Manual acceptance checklist:

- DB has exactly the two columns, composite PK, actual ordering CHECK, FKs and second-column index. Verify self/reversed/duplicate insertion is rejected in a rolled-back transaction or isolated fixture.
- Backfill yields ordered, unique pairs; repeated runs have the same pair set for unchanged data. A failed run preserves the previous successful snapshot. Archived/deleted cards disappear on refresh (deleted cards also cascade immediately).
- Semantic matches use normalized similarity >= 0.82; no RRF/popularity threshold. No cap of three or 100 matches in the backfill. Directional matches from either scan direction survive.
- Known local sanity check: question 1136 (`Orders + People + Products pg sandbox repro`) previously matched 1090 at about 0.824 with this model. This is illustrative, not a fixed assertion about future index contents.
- Grouping example above includes rows for d, e, g, and h. No transitive edges. Page boundary splitting `a`'s edges merges correctly; no repeated duplicate chips.
- Pagination uses pair counts, deterministic ordering, bounded limits; rebuild during Load more resets the accumulated snapshot.
- Unauthorized read/rebuild requests are rejected, and unreadable counterparts never leak through IDs/names/counts.
- Navigation appears in the requested Content management section; opening it does not perform per-row embeddings; links open saved questions; empty/error/running states are distinct.
- Existing Info Overview list stays below Fields and above Entity ID; no main-page duplicate indication is reintroduced.
- Run targeted lint/formatting, `git diff --check`, and the repo migration linter (`./bin/lint-migrations-file.sh`, confirm invocation). Type checking previously reported unrelated ProseMirror/Tiptap dependency-version errors; report these separately from changed-file errors. Do not silently fix unrelated dependencies.

## Explicit limitations / future work

The initial full-pass algorithm can be expensive and holds discovered pairs in memory; it is suitable for this local hackathon dataset. Resumable scans, incremental invalidation, generation tables, ranking/candidate optimizations, and a labeled-data threshold evaluation are later work. Daily/manual refresh means title/description edits may remain stale until a successful pass. Concurrent edits during a pass are eventually consistent, not a cross-database point-in-time snapshot. Similar metadata identifies potential duplicates, not proof that two SQL/MBQL queries return identical data.
