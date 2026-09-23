# Loading state violated date-picker type contract

Source: Codex session 2026-09-14, [transcript](/Users/christruter/.codex/sessions/2026/09/14/rollout-2026-09-14T16-06-37-01a0a187-5bee-71b0-80ed-028f6d2c14ac.jsonl).

Observed risk: Copilot pointed out that a date picker could receive `undefined` for `start-of-week` before settings finished loading. A newly stricter CLJS time utility could then throw while rendering ([line 5509](/Users/christruter/.codex/sessions/2026/09/14/rollout-2026-09-14T16-06-37-01a0a187-5bee-71b0-80ed-028f6d2c14ac.jsonl#L5509)).

Mechanism: the production state type claimed settings were always complete even though the selector handled an empty loading state. That made the omission easy for an agent to miss. The agent had to deliberately delete a runtime key in the test fixture to reproduce the real state ([line 5695](/Users/christruter/.codex/sessions/2026/09/14/rollout-2026-09-14T16-06-37-01a0a187-5bee-71b0-80ed-028f6d2c14ac.jsonl#L5695)).

Recorded repair: the agent verified that master used Sunday as the fallback, added handling in `frontend/src/metabase/querying/common/components/DatePicker/RelativeDatePicker/use-time-config.ts`, and reported 129 RelativeDatePicker tests passing before pushing and resolving the review thread ([lines 5583–5743](/Users/christruter/.codex/sessions/2026/09/14/rollout-2026-09-14T16-06-37-01a0a187-5bee-71b0-80ed-028f6d2c14ac.jsonl#L5583)).

Classification: review-detected near miss; optimistic type contract hid a valid loading state from agent implementation and ordinary fixtures.
