# Imported Clj-Kondo hook produced noisy startup warnings

Source: Codex session 2026-03-23, [transcript](/Users/christruter/.codex/sessions/2026/03/23/rollout-2026-03-23T17-45-57-019d1b5f-d13c-7af3-b9a7-4adeff64e3e3.jsonl).

Observed failure: lint startup repeatedly printed `taoensso/nippy not found while loading hook` even when the lint result itself had zero warnings ([lines 7 and 68](/Users/christruter/.codex/sessions/2026/03/23/rollout-2026-03-23T17-45-57-019d1b5f-d13c-7af3-b9a7-4adeff64e3e3.jsonl#L7)). This adds noise and undermines confidence in lint output.

Mechanism: copied `.clj-kondo/cnuernber/dtype-next/config.edn` registered Nippy macroexpand hooks; the `:kondo` alias in `deps.edn` used `:replace-deps`, leaving Nippy absent from the Kondo JVM classpath ([lines 27, 62 and 70](/Users/christruter/.codex/sessions/2026/03/23/rollout-2026-03-23T17-45-57-019d1b5f-d13c-7af3-b9a7-4adeff64e3e3.jsonl#L27)).

Agent fumble: after the user requested a less invasive fix ([line 84](/Users/christruter/.codex/sessions/2026/03/23/rollout-2026-03-23T17-45-57-019d1b5f-d13c-7af3-b9a7-4adeff64e3e3.jsonl#L84)), the agent added a local override but duplicated the `:macroexpand` map. That broke config parsing and created a spurious unresolved-symbol error ([lines 99–109](/Users/christruter/.codex/sessions/2026/03/23/rollout-2026-03-23T17-45-57-019d1b5f-d13c-7af3-b9a7-4adeff64e3e3.jsonl#L99)). It then merged entries into the existing map and got a clean lint startup ([lines 119–131](/Users/christruter/.codex/sessions/2026/03/23/rollout-2026-03-23T17-45-57-019d1b5f-d13c-7af3-b9a7-4adeff64e3e3.jsonl#L119)).

Classification: confirmed lint configuration papercut; noisy warning led to a failed repair and another iteration.
