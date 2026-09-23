---
title: Metabase general-search ingestion drains through an in-process DelayQueue, so external harnesses have no durable "indexing is done" signal; index rotation also leaves retired tables and several active rows
slug: search-ingestion-no-durable-drain-signal
kind: codebase-trap
impact: both
severity: medium
status: open
area: metabase src/metabase/search/ingestion.clj, search/models/search_index_metadata.clj, search/appdb/index.clj; consumers in evals stats/build.py
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-evals/4ba68340-d63c-40cc-a449-6b56ac132245.jsonl
    lines: 1968-2302
    date: 2026-08-31
    jev: {self_inflicted_bug: 0.97, tool_misuse: 0.95, misleading_signal: 0.60, user_correction: 0.11, codebase_trap: 0.85, flailing: 0.65, env_friction: 0.85}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-evals/4ba68340-d63c-40cc-a449-6b56ac132245.jsonl
    lines: 1376-1724
    date: 2026-08-30
    jev: {self_inflicted_bug: 0.97, tool_misuse: 0.76, misleading_signal: 0.84, user_correction: 0.13, codebase_trap: 0.83, flailing: 0.59, env_friction: 0.55}
---
## Summary
The evals stats build boots Metabase, lets search index, stops the container, and dumps the app DB. It needs to know when general search and semantic search have finished. The app DB offers only indirect signals:
- `search_index_metadata` status rows.
- Row counts in `search_index__*` tables.
- The semantic `index_gate` table.

All three can look "done" while work is still pending. Updates sit in an in-process `java.util.concurrent.DelayQueue` (`search.ingestion/queue`) that is invisible from outside the JVM. `index_gate` is downstream of that same queue. The agent built several gates on these indirect signals:
- A row-count equality check.
- "Serving name == recorded name".
- A `_wait_for_general_search` "convergence window" that returned on its first poll.

Reviewers kept finding holes in them. Separately, promoting a rebuilt index demotes the old one without dropping its physical table. `search_index_metadata` can also legitimately hold more than one `active` row (keyed by engine + version + lang_code). Both broke the agent's first "drop retired tables" SQL.

## Symptom
- L2099-2104: roborev Medium, "General-search convergence is still not established". ASSISTANT: "general-search ingestion uses an **in-process `DelayQueue`**, not a database table — so unlike the semantic side's `index_gate` checkpoint, there's nothing durable to poll."
- L2152: traced chain `entity change → search.ingestion DelayQueue → worker pops → search.engine/update! → pgvector-api → gate-documents! → index_gate`. So an empty `index_gate` plus `indexer_last_seen` "proves only that everything *already flushed* has been embedded".
- L2159: the PR's own `assert_semantic_index_drained` (commit 9e2a2ac) has the same tail race.
- L2170-2175: the count-based "convergence window" returned immediately, because the index already held `expected` rows before the drain boot. The build was stopped mid-run.
- L1387 (round-2 review): because rotation leaves the demoted table behind, the agent had written a "drop retired" statement defined as "not the active one". With zero active rows it dropped everything.
- L2019-2022: verified in Metabase source that `active-pending!` filters by engine + version + lang_code, "so multiple active rows are genuinely possible". The guard had to become `count(DISTINCT index_name)`.

## Timeline
- L1402: first guard, `IF active_indexes <> 1 THEN RAISE`.
- L1559: changed to `count(DISTINCT index_name)` after a reviewer pointed out locale-split rows.
- L1778: added a `_wait_for_general_search` call inside settle as a "convergence window".
- L2100-2119: grep of metabase source finds `search.ingestion/queue`, `message-delay-ms`, and the `:metabase-search/queue-size` Prometheus gauge. It concludes the only real signal is that gauge, and the build doesn't enable `MB_PROMETHEUS_SERVER_PORT`.
- L2196: deletes the in-boot wait. The comment "now claims only what the check establishes". The real fix (poll the queue-size gauge) is deferred.

## Root cause
- `src/metabase/search/ingestion.clj:24`: `(defonce ^:private ^DelayQueue queue (queue/delay-queue))`, with `message-delay-ms` 100 at `:28-31`. The queue depth is exposed only as the Prometheus gauge `:metabase-search/queue-size` (`ingestion.clj:283-284`, registered at `src/metabase/analytics/prometheus.clj:398`). Metabase itself reads it only by reaching into the private var (`src/metabase/search/appdb/core.clj:119`, `@#'search.ingestion/queue`).
- `src/metabase/search/models/search_index_metadata.clj:61-71` `active-pending!` retires the old active row (`retire-active-index-metadata!`) but leaves its table. Tables are removed later by `delete-obsolete-tables!` (`search/appdb/index.clj:131`), which a harness that stops the JVM early may never reach.
- All metadata queries are scoped by `(i18n/site-locale-string)`, so rows for different locales and versions sit side by side with `status = 'active'`.

## Why agents fall for it
- `search_index_metadata.status = 'active'` reads like a single-row invariant.
- Row counts matching the corpus count looks like convergence, but the count is equal at t=0 in the drain path.
- The semantic side has a durable gate table, so it's natural to assume general search has one too.
- Nothing in the search module documents the external observability story.

## Current state
Still present in the current checkout (see file:line above). The evals side added count, name, and distinct-index guards (evals `stats/sql.py:344-345`) and records the population at the index stage. The queue-depth signal was logged "for the morning" and not wired in this session. Memory `reference_search_lease_invariants.md` and the wiki notes "Search index lifecycle and the gate.md" / "Search indexing mechanisms.md" exist but were not consulted in this session, and don't appear to cover the external-drain question.

## Suggested fix
- Metabase: expose ingestion queue depth durably or over the API (e.g. `GET /api/search/status` returning queue size plus active index per locale), or record a "drained-at" watermark in the app DB.
- Metabase: drop a retired index's table when it is retired, or document that `retired` rows leave tables until `delete-obsolete-tables!`.
- evals: enable `MB_PROMETHEUS_SERVER_PORT` on the drain boot and poll `metabase_search_queue_size` to zero, stable across N polls, before `compose stop`.
- Document in the search module README / CLAUDE notes that "one active row" is per engine+version+locale.

## Detection signal
- SQL in consumers of `search_index_metadata` that filters `status = 'active'` without locale or engine, or uses `NOT IN (SELECT ... WHERE status='active')`.
- Harness code that treats `count(*) == expected` on a `search_index__*` table as proof of convergence.
- Grep hits on `@#'search.ingestion/queue` (private var access) show where people needed the signal.

## Raw excerpts
```
L2154 [RESULT] === the queue's delay ===
;; Currently we use a single queue, even if multiple engines are enabled, but may want to revisit this.
(defonce ^:private ^DelayQueue queue (queue/delay-queue))
(def ^:private message-delay-ms
  "The time a message should wait before coming off the queue.
  This delay exists to ensure the data is fully committed before indexing ...
```
```
L2159 So `index_gate` sits **downstream of the same in-process queue**. An empty gate plus a satisfied `indexer_last_seen` proves only that everything *already flushed* has been embedded — it says nothing about work still in the queue. `assert_semantic_index_drained` passes in exactly that state.
... Enabling `MB_PROMETHEUS_SERVER_PORT` on the drain boot and polling that gauge to zero before `compose stop` is the real convergence signal for both pipelines. It isn't configured for the build's Metabase today.
```
```
L2014 === two active SAME table: is the metadata left coherent? ===
search_index__aaaaaaaaaaaaaaaaaaaaa active en
search_index__aaaaaaaaaaaaaaaaaaaaa active fr
```
