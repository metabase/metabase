# Search-index helper hid a mutable active-table race

Sources: two archived Codex sessions on 2026-03-23: [first transcript](/Users/christruter/.codex/archived_sessions/rollout-2026-03-23T15-47-30-019d1af3-6010-7371-871c-12cf3fba4bdd.jsonl), [follow-up](/Users/christruter/.codex/archived_sessions/rollout-2026-03-23T18-04-55-019d1b71-2deb-7d21-ab6a-ca5d45a37b1a.jsonl).

Observed sequence: a previous `safe-batch-upsert!` fix could retry using a stale table name from tracking atoms. The user asked to resolve the table name again after resync and check that it still existed ([first transcript, line 7](/Users/christruter/.codex/archived_sessions/rollout-2026-03-23T15-47-30-019d1af3-6010-7371-871c-12cf3fba4bdd.jsonl#L7)). The agent changed the function and tests ([lines 383–386](/Users/christruter/.codex/archived_sessions/rollout-2026-03-23T15-47-30-019d1af3-6010-7371-871c-12cf3fba4bdd.jsonl#L383)).

The follow-up exposed more ambiguity in the helper's contract: why was a table name threaded through its return path ([follow-up, line 7](/Users/christruter/.codex/archived_sessions/rollout-2026-03-23T18-04-55-019d1b71-2deb-7d21-ab6a-ca5d45a37b1a.jsonl#L7))? The user then noticed a table deletion race during row count ([line 140](/Users/christruter/.codex/archived_sessions/rollout-2026-03-23T18-04-55-019d1b71-2deb-7d21-ab6a-ca5d45a37b1a.jsonl#L140)) and concluded that the helper needed to return the actual table written, so counting did not target an older active table ([line 181](/Users/christruter/.codex/archived_sessions/rollout-2026-03-23T18-04-55-019d1b71-2deb-7d21-ab6a-ca5d45a37b1a.jsonl#L181)).

Mechanism: the active search table can change while a batch writes. Tracking atoms and best-effort helper behavior made the target implicit. A retry or later row count that re-read “active” could act on a different table from the write. The repeated repair across sessions is the papercut signal.

Code: `src/metabase/search/appdb/index.clj`. Classification: confirmed concurrency/API-contract papercut; subtle wrong-target behavior and follow-on rework.
