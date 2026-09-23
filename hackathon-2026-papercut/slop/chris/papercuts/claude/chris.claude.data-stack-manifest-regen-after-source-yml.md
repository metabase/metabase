---
title: "data-stack: editing sources/<name>/source.yml without `make regen` leaves sources/manifest.json stale, and terraform reads the manifest, so a tier change merges and does nothing"
slug: data-stack-manifest-regen-after-source-yml
kind: codebase-trap
impact: both
severity: low
status: documented-still-hit
area: metabase/data-stack — sources/*/source.yml, sources/manifest.json (generated), Makefile `regen`, pipeline/tests/test_validate.py
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-stats-remote-sync/6fdcc6ed-191e-460e-8ffe-523a794c6ac7.jsonl
    lines: 2956-3054
    date: 2026-09-03
    jev: {self_inflicted_bug: 0.95, tool_misuse: 0.61, misleading_signal: 0.82, user_correction: 0.63, codebase_trap: 0.82, flailing: 0.42, env_friction: 0.66}
---
## Summary
To fix an OOM in `evals_ingest`, the agent changed `sources/evals/source.yml` `runtime: standard` → `runtime: heavy`. It ran the targeted tests (DAG integrity, spec/contract), committed, and opened data-stack#120 "while the full suite finishes".
The full suite then failed `pipeline/tests/test_validate.py::TestTheShippedDirectory::test_the_committed_manifest_is_current`.
The validator's message explains the stakes: "Shell, compose and terraform read it instead of parsing YAML, so a stale one means a pool that is never created or a task definition with no credential."
The agent: "Terraform sizes the task from `sources/manifest.json`, not from the YAML. **As pushed, this PR would merge and change nothing.**"
It regenerated the manifest (`ingest`/`backfill`/`reconcile`: `standard` → `heavy`) and pushed a second commit.

## Symptom
A green-looking targeted test run and an opened PR whose only change would have had no effect in production. The failure showed up in the full test suite, not the targeted one.

## Timeline
- L2957-2958: the agent checks the schema tiers (`heavy = large snapshots and anything holding rows in memory`) and the precedent in `sources/lever/source.yml:49`.
- L2962: branch `evals-heavy-runtime`, a Python one-liner replaces `runtime: standard`.
- L2996: "Targeted tests pass (99 DAG integrity, 60 spec/contract). Committing while the full suite finishes".
- L3024: "PR **#120** is up ... and the full suite flagged something".
- L3026: `FAILED pipeline/tests/test_validate.py::TestTheShippedDirectory::test_the_committed_manifest_is_current`. The other failures are the pre-existing `test_secrets_gate.py` ones, which fail on a clean tree (checked at L329-330).
- L3040-3046: the agent reads `check_manifest` and realises the manifest drives terraform.
- L3047-3048: runs `uv run ingest manifest`; the diff shows `"ingest": "heavy", "backfill": "heavy", "reconcile": "heavy"`.
- L3054: commits "Regenerate sources/manifest.json for the tier change".

## Root cause
`sources/manifest.json` is a derived artifact that downstream consumers (shell, compose, terraform) read instead of the YAML, so the YAML alone is not the source of truth at deploy time.
Nothing regenerates it on save or commit. The only checks are a pytest and a CI step (`ingest manifest --check` + `git diff --exit-code`).
The 5 pre-existing `test_secrets_gate` failures in the local suite make "the full suite fails" normal, which encourages running targeted tests and moving on.

## Why agents fall for it
- Editing the spec field the schema documents feels complete.
- The targeted tests the agent picked (DAG integrity, spec) don't include the manifest check.
- The generated file sits in `sources/` next to the YAML, and nothing marks it "generated" at the point of editing (it is marked in CLAUDE.md's file table).

## Current state
- Documented: data-stack `CLAUDE.md:76` "`sources/manifest.json` | Generated. What shell, compose and terraform read instead of parsing YAML." and `README.md:128` "run `make regen` to rebuild `sources/manifest.json`".
- Guarded: `pipeline/src/ingest_runtime/validate.py:414-428` `check_manifest`, and `.github/workflows/ci.yml:123-131` (`uv run ingest manifest --check`, `git diff --exit-code -- sources/manifest.json ...`). CI would have blocked the merge, so the practical risk is low.
- The trap is still there for any `source.yml` edit.

## Suggested fix
- A pre-commit hook in data-stack that runs `uv run ingest manifest --check` when `sources/**/source.yml` is staged.
- Or make `make regen` part of the edit workflow in CLAUDE.md: "after editing any source.yml, run `make regen` and commit both".
- Fix or skip the 5 `test_secrets_gate` failures so a red full suite means something locally.

## Detection signal
- The diff touches `sources/*/source.yml` but not `sources/manifest.json`.
- Commit/PR creation before the full test run finishes ("Committing while the full suite finishes").

## Raw excerpts
```
L3042 [RESULT] 351:def check_manifest(directory=None):
352-    """Whether sources/manifest.json still matches the specs."""
...
359:    if stored != build(base):
360-        return [Finding(
...
=== regeneration command ===
Makefile:253:	uv run ingest inventory
L3046 [ASSISTANT] That error message matters a lot:
> "Shell, compose and terraform read it instead of parsing YAML, so a stale one means a pool that is never created or **a task definition with no credential**"
Terraform sizes the task from `sources/manifest.json`, not from the YAML. **As pushed, this PR would merge and change nothing.**
L3048 [RESULT] wrote /Users/christruter/workspace/metabase/data-stack/sources/manifest.json
=== diff ===
 sources/manifest.json | 6 +++---
-        "backfill": "standard",
-        "reconcile": "standard"
+        "ingest": "heavy",
+        "backfill": "heavy",
+        "reconcile": "heavy"
```
