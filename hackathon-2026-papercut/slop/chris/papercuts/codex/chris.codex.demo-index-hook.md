# Demo description edit bypassed the Library indexing hook

Source: Codex session 2026-09-16, [transcript](/Users/christruter/.codex/sessions/2026/09/16/rollout-2026-09-16T17-16-42-01a0ac14-3bc8-7950-be6f-ee4c06fd13dd.jsonl).

Observed failure: editing the description of a non-approved generated entity did not show that the Library index needed updating ([line 9](/Users/christruter/.codex/sessions/2026/09/16/rollout-2026-09-16T17-16-42-01a0ac14-3bc8-7950-be6f-ee4c06fd13dd.jsonl#L9)). The agent traced a stale index document that would persist until periodic full reconcile; the UI exposed only “Source changed” rather than a regenerate/reindex action ([line 229](/Users/christruter/.codex/sessions/2026/09/16/rollout-2026-09-16T17-16-42-01a0ac14-3bc8-7950-be6f-ee4c06fd13dd.jsonl#L229)).

Mechanism: the demo description endpoint wrote the entity directly and bypassed `OsiAiContext` model hooks. Those hooks normally schedule targeted Library-index synchronization. A code path that looks equivalent at the data layer was not equivalent in its side effects.

Recorded repair: changes to `enterprise/backend/src/metabase_enterprise/osi_generation/demo_api.clj`, its test, and the demo UI were committed and pushed as `d1208391d39`; the agent reported 15 focused tests and 51 assertions passing ([line 291](/Users/christruter/.codex/sessions/2026/09/16/rollout-2026-09-16T17-16-42-01a0ac14-3bc8-7950-be6f-ee4c06fd13dd.jsonl#L291)).

Classification: confirmed code-path papercut; subtle stale derived data, hidden by a UI state that did not expose the missing action.
