---
title: A new .github/scripts/*.unit.spec.ts passed jest locally (swc, no type check) but broke CI fe-type-check, and pulled FE + e2e CI onto a backend-only PR
slug: jest-swc-passes-but-tsc-fails-github-scripts-spec
kind: misleading-signal
impact: introduced-bug
severity: medium
status: documented-still-hit
area: .github/scripts/*.unit.spec.ts, jest.base.conf.js (@swc/jest), tsconfig.json include, .github/file-paths.yaml ci_scripts
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-kondo-ratchets-merge-script/a0ba828b-731a-40b4-ac34-8be70d1da238.jsonl
    lines: 494-520, 866-931
    date: 2026-08-31
    jev: {self_inflicted_bug: 0.97, tool_misuse: 0.93, misleading_signal: 0.75, user_correction: 0.70, codebase_trap: 0.71, flailing: 0.34, env_friction: 0.79}
---
## Summary
The agent added `.github/scripts/file-paths.unit.spec.ts` to guard `.github/file-paths.yaml` and verified it only with `node_modules/.bin/jest --runTestsByPath ...` (pass). Jest here transforms with `@swc/jest`, which strips types and never type-checks. The file had `type Filter = string | Filter[] | Record<string, Filter>;`, which tsc rejects (TS2456, circular alias). CI's `frontend-tests / fe-type-check` failed, plus `fe-tests-unit (1)`. Adding any file under `.github/scripts/**` also turned on the frontend and e2e suites for what had been a workflow/backend PR (220 checks instead of backend-only). The agent found this only when the user asked "are there any failures on the earlier prs in this stack?".

## Symptom
PR #81319 went from backend-only checks to failing `frontend-tests / fe-type-check`, `fe-tests-unit (1)`, `fe-tests-result`, plus a new e2e group failure. Locally, jest was green.

## Timeline
- L497-498: first jest run of the new spec fails at runtime (YAML filter entries can be `{ "added|modified": pattern }` objects).
- L505-506: fix adds `Record<string, Filter>` to the union; jest: `1 passed`. Committed at L519 with `git -c core.hooksPath=/dev/null commit` (hooks skipped, so no lint-staged/type check either).
- L869-870 (user asks about failures): `#81319 ... FAIL: frontend-tests / fe-tests-result ... e2e-group-16-ee`.
- L873 agent: "Those frontend failures on `#81319` are suspicious — I added a `.ts` file to that branch."
- L898: "Those FE checks didn't even run before my commits — my `.ts` file pulled them in."
- L899-900: `gh run view --job ... --log-failed` -> "run ... is still in progress; logs will be available when it is complete".
- L902-906: tsconfig.json includes `.github/scripts/**/*`; `./node_modules/typescript7/bin/tsc --noEmit` -> `.github/scripts/file-paths.unit.spec.ts(8,6): error TS2456: Type alias 'Filter' circularly references itself.` (plus unrelated `cljs/...` errors because build:cljs was skipped).
- L917-923: fixed with an inline index signature, re-verified with tsc and jest, pushed.
- L931 agent: "that spec file makes this workflow PR run frontend and e2e CI from now on."

## Root cause
Two gates with different strictness: jest via swc (no types) is the obvious local check for a `*.unit.spec.ts`; tsc runs only in CI's fe-type-check (and via `bun run type-check-pure`). `.github/scripts/**` is in tsconfig's include and in `.github/file-paths.yaml`'s frontend-triggering filters, which isn't obvious from a PR that is otherwise about workflows.

## Why agents fall for it
"The test passes" feels like full verification for a test file. The typescript-write skill, which says to run type-check, only loads when the agent thinks it is doing TS work; here it was "writing a test for a YAML file". Hooks were bypassed with `core.hooksPath=/dev/null`, removing any lint-staged backstop.

## Current state
- jest.base.conf.js:5-6 uses `@swc/jest`.
- tsconfig.json include has `".github/scripts/**/*"`.
- .github/file-paths.yaml `ci_scripts` filter (around line 116-130) includes `".github/scripts/**"` and now `".github/file-paths.yaml"` (the user added the latter, commit 500e92444a5).
- Documented: .claude/skills/typescript-write/SKILL.md:16 "Before finishing a TS/TSX change, run `bun run type-check-pure`." Not mentioned in frontend/CLAUDE.md or root CLAUDE.md. Status: documented-still-hit.

## Suggested fix
- Root CLAUDE.md or frontend/CLAUDE.md: "jest uses swc and does not type-check; after touching any .ts/.tsx (including .github/scripts specs) run `bun run type-check-pure` (or `./node_modules/typescript7/bin/tsc --noEmit`)."
- Consider a jest project for `.github/scripts` that uses ts-jest with type checking, or a fast `tsc -p .github/scripts/tsconfig.json` step.
- A PreToolUse hook that reminds about type-check when a `git commit` includes `.ts` files and hooks are disabled.

## Detection signal
- Transcript: a `.ts` file created/edited and `jest` run, but no `tsc`/`type-check` invocation before `git commit`/`git push`.
- CI: `fe-type-check` failing on a PR whose only TS change is under `.github/scripts/`.

## Raw excerpts
```
L506 file-paths.yaml  ✓ never excludes a path with a standalone negation (5 ms)  Tests: 1 passed, 1 total
L895 run head=954200aeadf ... my commit shas on this branch ... 3d2e859d99d Guard against standalone negations in the path filters
L906 .github/scripts/file-paths.unit.spec.ts(8,6): error TS2456: Type alias 'Filter' circularly references itself.
L923 git commit ... "Fix the circular Filter type alias" -m "Record<string, Filter> is expanded eagerly, so naming it inside Filter's own definition trips TS2456. An inline index signature is deferred and holds the same shape."
L931 **#81319** — this one I broke. Adding `.github/scripts/file-paths.unit.spec.ts` pulled the whole frontend suite onto a PR that previously only ran backend jobs, and my file didn't type-check
```
