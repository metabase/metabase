---
title: A green `eastwood` run over the backend source says nothing about CI's "Eastwood (changed tests only)" job, which lints test namespaces through a separate `:eastwood/test` alias; the agent reported "Eastwood clean backend-wide" and CI failed on a reflection warning in a test
slug: eastwood-source-alias-skips-changed-tests-gate
kind: test-harness
impact: wasted-time
severity: medium
status: documented-still-hit
area: .github/workflows/backend.yml be-linter-eastwood-test-changed; deps.edn :eastwood vs :eastwood/test aliases; memory reference_eastwood_reflection_ci_gate.md
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-pr-03-llm-config/93bd1b32-5bde-4582-9d8a-53740b3387ef.jsonl
    lines: 2808-2812, 4036-4132, 4418-4433
    date: 2026-08-30
    jev: {self_inflicted_bug: 0.78, tool_misuse: 0.94, misleading_signal: 0.67, user_correction: 0.07, codebase_trap: 0.87, flailing: 0.66, env_friction: 0.92}
---
## Summary
During "extremely well validated" pre-review hardening, the agent ran Eastwood and reported
"**0 warnings, 0 exceptions** across the whole backend" (L2808-2812). After the PRs left draft, CI's
`backend-tests / Eastwood (changed tests only)` failed on #79980. The cause was `(.getName trigger-key)` in
`osi_generation/task/generate_test.clj:94`, a reflective call in a *test* namespace. The source-wide alias doesn't
lint tests. The agent reproduced it with the CI command
(`clojure -X:dev:ee:ee-dev:drivers:drivers-dev:test:eastwood/test :namespaces "[...]"`), added a `^TriggerKey`
hint, and then ran the same command for all four branches. At wrap-up it found that memory
`reference_eastwood_reflection_ci_gate.md` already named this exact CI job and command: "I had the knowledge and
didn't apply it."

## Symptom
```
L4039 === #79980 failing ===  backend-tests / Cljfmt ; backend-tests / Eastwood (changed tests only)
L4096 == Linting metabase-enterprise.osi-generation.generate-test == ... == Warnings: 1. Exceptions thrown: 0
L4132 [ASSISTANT] ... I ran Eastwood earlier and reported it clean backend-wide — but that alias lints **source**, not tests.
There's a separate `eastwood/test` target and a changed-tests-only CI job I never ran.
L4426 [ASSISTANT] Both memories already existed — the Eastwood one even names the exact CI job. I had the knowledge and didn't apply it.
```

## Timeline
- L2738-2812: "run the checks CI will apply", which runs Eastwood (source) and reports it clean.
- L4036-4039: CI red on Cljfmt (see `memory-no-verify-workaround-invites-preemptive-hook-bypass`) and Eastwood (changed tests only).
- L4086-4093: reads `backend.yml` to find the job's namespace computation.
- L4095-4126: runs `:eastwood/test` on each branch's changed test namespaces (~40-50 s each); one warning, fixed.
- L4418-4426: rereads the memory.

## Root cause
Two Eastwood entry points with different scopes. Local test runs (`./bin/test-agent`) compile tests without
failing on reflection. The CI gate is changed-tests-only and computed from the merge-base, so no single local
"run everything" command matches it. The memory records the command, but agents don't open it when they
think "I already ran Eastwood".

## Why agents fall for it
"Eastwood: 0 warnings" feels complete. The job name "(changed tests only)" appears only in CI output. There's no
`mage` wrapper that reproduces the CI job.

## Current state
- CI job: `.github/workflows/backend.yml` `be-linter-eastwood-test-changed` (seen at L4087-4093 on the branch; lines ~86-145).
- Memory: `~/.claude/projects/-Users-christruter-workspace-metabase-metabase/memory/reference_eastwood_reflection_ci_gate.md` ("CI's Eastwood job fails on reflection warnings that local test runs happily ignore") and MEMORY.md index entry "Eastwood reflection CI gate — check changed nses before pushing". Documented, still hit.

## Suggested fix
- `./bin/mage eastwood-changed-tests [<base>]` that runs the exact CI computation (merge-base diff → namespaces → `:eastwood/test`). Mention it in CLAUDE.md next to the kondo/cljfmt instructions.
- Or make `test-agent` warn on reflection in changed test namespaces (`*warn-on-reflection*` output grep).

## Detection signal
Transcript: an agent says "Eastwood clean" after running a command without `eastwood/test` while test files are in
the diff. CI: the "Eastwood (changed tests only)" failure on a branch whose session ran the source alias.

## Raw excerpts
```
L4095 NS=$(git diff --name-only --diff-filter=AMR pr/03-llm-config...pr/engine -- 'test/**/*.clj' ... \
     | sed -E 's#^(test/|enterprise/backend/test/)##; s#\.cljc?$##; s#/#.#g; s#_#-#g' | sort -u | paste -sd' ' -)
timeout 1500 clojure -X:dev:ee:ee-dev:drivers:drivers-dev:test:eastwood/test :namespaces "[$NS]"
L4113 (defn existing-triggers ... (.getName ^TriggerKey trigger-key) ...)   ; production hint the test lacked
```
