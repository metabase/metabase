# Malli schema docstring unexpectedly changed API validation output

Source: Codex session 2026-03-23, [transcript](/Users/christruter/.codex/sessions/2026/03/23/rollout-2026-03-23T18-25-15-019d1b83-cc85-7282-a66e-8296c6520a6b.jsonl).

Observed failure: a frontend-errors API test expected allowed enum values in a validation error, but got the prose sentence “Allowed type values for frontend error reporting.” instead ([line 7](/Users/christruter/.codex/sessions/2026/03/23/rollout-2026-03-23T18-25-15-019d1b83-cc85-7282-a66e-8296c6520a6b.jsonl#L7)).

Mechanism: a docstring on `mr/def ::frontend-error-type` silently became Malli's `:description`, overriding the default precise enum error. The agent removed the prose docstring from `src/metabase/frontend_errors/api.clj` ([line 40](/Users/christruter/.codex/sessions/2026/03/23/rollout-2026-03-23T18-25-15-019d1b83-cc85-7282-a66e-8296c6520a6b.jsonl#L40)). The user questioned whether the test should instead change ([line 61](/Users/christruter/.codex/sessions/2026/03/23/rollout-2026-03-23T18-25-15-019d1b83-cc85-7282-a66e-8296c6520a6b.jsonl#L61)); the agent explained the runtime effect and reported one focused test with seven assertions passing ([line 145](/Users/christruter/.codex/sessions/2026/03/23/rollout-2026-03-23T18-25-15-019d1b83-cc85-7282-a66e-8296c6520a6b.jsonl#L145)).

Related rework in the same feature: an earlier agent changed `mr/def` to a local schema to escape a module-boundary warning, then the user directed it back to `mr/def` and to declare the `metabase.util` module dependency instead ([earlier transcript, lines 173–219](/Users/christruter/.codex/sessions/2026/03/23/rollout-2026-03-23T15-40-44-019d1aed-2da7-7032-9cf6-2a7729776077.jsonl#L173)). That shows a second agent detour around this API.

Classification: confirmed hidden runtime effect of documentation; test failure and debated production-code change.
