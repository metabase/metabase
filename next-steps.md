- `dev/notes/complexity-v3-followup-tier-3-structural.md` — join graph (density / components / cyclomatic / avg path length), inheritance depth, collection tree depth/breadth/entropy. New metrics/structural.clj, bump max-level to 3.
- `dev/notes/complexity-v3-followup-tier-4-percentile.md` — percentile-anchored synonym pair count as a model-invariant companion to the fixed-0.90 count. Lives in the :semantic dim, gates behind level 4.
- `dev/notes/complexity-v3-followup-weight-calibration.md` — calibration pass: collect per-instance variable values, label with agent-failure telemetry or human ratings, fit weights via simple linear regression with integer rounding. Small patch, research-heavy. Bumps formula-version to 4.
- `dev/notes/complexity-v3-followup-tier-fixture-enrichment.md` — enrich the three tier fixtures with descriptions / semantic_types so the metadata dimension has non-trivial assertions at every tier. Test-resource change only, no production code.

Each plan is self-contained (context, shape, file changes, tests, verification, open questions, explicit non-goals) so they can be picked up and executed independently.
