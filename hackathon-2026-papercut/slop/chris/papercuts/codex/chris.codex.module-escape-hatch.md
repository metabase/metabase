# Legacy module exception was reused for new code

Source: Codex session 2026-09-14, [transcript](/Users/christruter/.codex/sessions/2026/09/14/rollout-2026-09-14T16-06-37-01a0a187-5bee-71b0-80ed-028f6d2c14ac.jsonl).

Observed failure: while adding a new `segments.rest` module, the agent added an `ns-prefix` escape hatch and a module-linter exception for a test HTTP handler. The Project ratchet then failed because the new module created the 82nd `ns-prefix` exception ([line 5323](/Users/christruter/.codex/sessions/2026/09/14/rollout-2026-09-14T16-06-37-01a0a187-5bee-71b0-80ed-028f6d2c14ac.jsonl#L5323)).

Mechanism: `ns-prefix` is present in module configuration as a migration aid for old code, so it looks reusable. The user clarified that new modules should use conventional nested namespace paths; the exception exists only to defer moving legacy code ([line 5155](/Users/christruter/.codex/sessions/2026/09/14/rollout-2026-09-14T16-06-37-01a0a187-5bee-71b0-80ed-028f6d2c14ac.jsonl#L5155)). The affordance invited a plausible but debt-creating implementation.

Recorded repair: the agent moved REST code under `metabase.segments.rest.api`, put the test handler under `metabase.test`, removed the exceptions and unnecessary dynamic requires, and reported 95 Project tests / 8,120 assertions passing. Commit `607217d39df` records the change ([lines 5353–5471](/Users/christruter/.codex/sessions/2026/09/14/rollout-2026-09-14T16-06-37-01a0a187-5bee-71b0-80ed-028f6d2c14ac.jsonl#L5353)).

Classification: confirmed code smell / migration papercut; an allowed exception misled the agent, with the ratchet catching it only after implementation.
