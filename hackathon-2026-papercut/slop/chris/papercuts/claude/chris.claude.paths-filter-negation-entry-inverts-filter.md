---
title: "A separate `\"!path\"` entry in .github/file-paths.yaml doesn't exclude that path. dorny/paths-filter ORs the patterns, so it matches every *other* path and switched the backend CI matrix on for docs- and frontend-only PRs; green CI on a backend PR can't reveal it"
slug: paths-filter-negation-entry-inverts-filter
kind: codebase-trap
impact: introduced-bug
severity: high
status: fixed
area: .github/file-paths.yaml (dorny/paths-filter@v4.0.1 filters used by run-tests.yml / backend.yml), CI path gating
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-kondo-ratchets-merge-script/a2d41fab-dd88-43ad-bebe-2e6c63b8a7d4.jsonl
    lines: 106-126 (found by /code-review in a pr-review subagent), 577-589 (fixed), 823-871 (pushed)
    date: 2026-08-30
    jev: {self_inflicted_bug: 0.89, tool_misuse: 0.17, misleading_signal: 0.24, user_correction: 0.92, codebase_trap: 0.68, flailing: 0.12, env_friction: 0.16}
---
## Summary
PR #81319 (BEGUILD-30 ratchet policy, written in an earlier agent session) wanted automation PRs that only lower `.clj-kondo/ratchets.edn` budgets to skip the backend test matrix. It added:
```yaml
backend_sources: &backend_sources
  ...
  - ".clj-kondo/**"
  # only the ratchet check reads the budgets ...
  - "!.clj-kondo/ratchets.edn"
```
`dorny/paths-filter` compiles each entry with picomatch and ORs them (`patterns.some(aPredicate)` in `src/filter.ts`). The `!` entry is therefore a pattern of its own that matches **every path except** `ratchets.edn`.
So `backend_sources` became true for any change at all, including `docs/questions/foo.md` and `frontend/src/metabase/App.tsx`. Every PR in the repo would have run the backend matrix.
The PR's own CI was green (195/195). The PR touches backend sources, so `backend_all` is true either way, and green CI tells you nothing here.

## Symptom
None visible in CI. It was found by reading the code: a `/code-review` pass inside a pr-review subagent rated it HIGH. The subagent confirmed it against the action's source at the pinned sha and by running the real `file-paths.yaml` through js-yaml + picomatch 2.3.1 (L108-126):
```
docs/questions/foo.md         backend_sources: false -> true
frontend/src/metabase/App.tsx backend_sources: false -> true
```

## Timeline
- L106-108: the #81319 review comes back: "**[HIGH] `.github/file-paths.yaml:119` — the `!` negation inverts the pattern instead of narrowing it.**" and "green here does not exercise F1: this PR changes backend sources".
- L577-583: the agent replaces the two entries with a single pattern: `".clj-kondo/{!(ratchets.edn),*/**}"`, and adds a comment: "these are matched with picomatch and OR-ed, so a separate "!..." entry would match every other path."
- L585-586: re-checked with the pinned picomatch: `docs/questions/foo.md backend_sources=false`, `.clj-kondo/ratchets.edn backend_sources=false`, `.clj-kondo/config.edn true`. "tracked .clj-kondo files: 82 | not matched: [".clj-kondo/ratchets.edn"]".
- L868: committed as "Exclude the ratchets file with one pattern".

## Root cause
Other glob-list tools use `!` entries as exclusions: `.gitignore`, GitHub Actions `on.push.paths`, many CI configs, and paths-filter itself when `predicate-quantifier: every` is set. With the default `predicate-quantifier: some`, paths-filter treats each list entry as an independent OR'd predicate.
The syntax looks right, and the linter, the YAML parser, and the PR's own CI all pass it.

## Why agents fall for it
- A strong prior from `.gitignore` and `on: push: paths:` semantics.
- The effect is invisible on the PR that introduces it (it touches backend files anyway), and it shows up as extra CI cost on *other* PRs, not as a failure.

## Current state
- Fixed on master: `.github/file-paths.yaml:155-158` now reads `- ".clj-kondo/**/!(ratchets.edn)"`, with the comment "Patterns are OR-ed, so a separate "!..." entry would match every other path instead of excluding this one."
- No other top-level `"!…"` entries in `.github/file-paths.yaml` (grep 2026-09-23).
- Documented only by that inline comment. No lint.

## Suggested fix
- A CI or pre-commit check that rejects list items starting with `!` in `.github/file-paths.yaml` (or wherever paths-filter `filters:` are defined) unless the filter sets `predicate-quantifier: every`.
- A test that evaluates each filter against a fixed set of paths (docs-only, frontend-only, ratchets-only) with the pinned picomatch, so a regression is visible on the PR that introduces it. The agent's node one-liner (L585) is most of that test already.

## Detection signal
- The diff adds a `- "!` line under a paths-filter filter.
- A reviewer or agent claiming "excluded from the backend filter" without evaluating the filter against a non-backend path.

## Raw excerpts
```
L579 [RESULT] 109	backend_sources: &backend_sources
110	  - *shared_sources
...
116	  - ".clj-kondo/**"
117	  # only the ratchet check reads the budgets (see project_backend_checks), so the automation PR that
118	  # lowers them runs the Project tests job alone
119	  - "!.clj-kondo/ratchets.edn"
```
```
L586 [RESULT] docs/questions/foo.md                      backend_sources=false  backend_all=false
frontend/src/metabase/App.tsx              backend_sources=false  backend_all=false
.clj-kondo/ratchets.edn                    backend_sources=false  backend_all=false
.clj-kondo/config.edn                      backend_sources=true   backend_all=true
.clj-kondo/config/modules/config.edn       backend_sources=true   backend_all=true
src/metabase/core.clj                      backend_sources=true   backend_all=true

tracked .clj-kondo files: 82 | not matched: [".clj-kondo/ratchets.edn"]
```
