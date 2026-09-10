# Handoff: semantic-layer harness (updated 2026-09-10, evening)

## Where things stand
- Branch `viz-ab-eval` in ~/Documents/projects/metabase. Do NOT merge `models-proto` (worktree
  ~/Documents/projects/metabase-models-proto: `dev/models_proto/`, `dev/src/dev/models_proto/`, two tests, a one-line
  `types/core.cljc` change); replay its ideas piece by piece when asked.
- **One dev instance now.** The harness backend is the only backend: http://localhost:3000 (EE, Postgres app DB
  `mb_semantic_layer`, nREPL 50606). The old H2-backed A/B backend on :3000 is retired (it held zero judgements).
  `make dev` (= the `metabase-dev` launch config) starts the backend if needed and runs the frontend watcher.
- `layers/pagila/` is built, loads in ~60s from a fresh reset, and was reviewed in the browser: dashboard + filters,
  metric overviews, the Rentals cube viewer, transform inspector, and `/_internal/overview/{table,metric}/…`.
- Resets keep the `viz_eval_judgement` / `overview_eval_judgement` tables (dumped to `.scratch/judgements.sql` and
  restored after the clone), so judging in the harness survives `layer-fresh`.
- Admin UI login: admin@semlayer.local / SemLayerDev123! (in `common.py`). `mb` profile `semlayer`.

## The loop
    make -C dev/semantic_layer layer-fresh SCHEMA=pagila   # reset warehouse + app DB (judgements kept), restart, run layers/pagila/build.sh
    make -C dev/semantic_layer reset-app                   # wipe just the instance
    make -C dev/semantic_layer up | down | restart | status | logs
See something wrong in the frontend → decide: semantic layer, generator, or viz heuristic → if semantic layer, edit
`layers/<schema>/` (`.claude/skills/build-semantic-layer/SKILL.md` is the method) and `layer-fresh` → back to the FE.

## Next
1. Replay the models-proto ideas onto this branch as their own changes (scope first: it is a spec + Clojure schema/
   resolve/ossie prototype under `dev/`, not app code).
2. Round-2 harness items still open: `metricToCatalog`, Transform arm, `buildSeries` settings merge for multi-series,
   `/explore` through the registry, cube measure ranking.

## Gotchas
- `.nrepl-port` now belongs to the single backend; `./bin/mage -repl` needs no port.
- `mb db` has no create verb; bootstrap adds the warehouse via REST. Re-run `make bootstrap` to change the template.
- Full details: README.md here; memory note `semantic-layer-harness`.
