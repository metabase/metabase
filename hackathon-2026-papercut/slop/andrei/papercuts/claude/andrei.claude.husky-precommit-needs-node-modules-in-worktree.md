---
title: In a fresh Metabase worktree `core.hooksPath=.husky/_` points at a directory only `husky install` creates in the main checkout, so commits run no pre-commit hook at all, lint-staged never runs `mage cljfmt-files`, and unformatted Clojure reached CI's cljfmt gate
slug: husky-precommit-needs-node-modules-in-worktree
kind: env-friction
impact: both
severity: medium
status: documented-still-hit # a local note covered it
area: git `core.hooksPath=.husky/_` (relative, shared config), husky, lint-staged.config.cjs (`./bin/mage cljfmt-files` for *.clj), git worktrees, CI `backend-tests / Cljfmt`
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/dcbc556d-c81c-4160-af67-238040132220.jsonl
    lines: 1658-1917
    date: 2026-09-11
    jev: {any_papercut: 0.80, env_toolchain: 0.64, stale_state: 0.21, verify_mismatch: 0.86, misleading_code: 0.21, hidden_coupling: 0.59, stale_docs: 0.40, tool_footgun: 0.82, flaky: 0.81, agent_bug: 0.95, wasted_effort: 0.84, user_correction: 0.93}
---
## Summary
The agent committed and pushed Clojure changes from a worktree; the commits produced no hook output, and the PR's CI then failed `backend-tests / Cljfmt` on a test file. Metabase's lint-staged config formats staged Clojure with `./bin/mage cljfmt-files`, but the shared git config sets `core.hooksPath=.husky/_`, a relative path to a directory husky generates only in the main checkout. Worktrees have no `.husky/_`, git finds no hooks there, and every commit silently skips formatting. The agent had run kondo and Eastwood locally but not cljfmt.

## Symptom
L1433 and L1658 commit and push from `~/src/mb/wt/<branch>` with no hook output. L1821-L1822 CI shows `backend-tests / Cljfmt` failing. L1837-L1850 the agent reads the job log and the workflow (`./bin/mage cljfmt-all --force-check`) and hunts for the local task. L1858-L1859 `./bin/mage cljfmt-updated origin/<base>` reformats `test/metabase/metabot/tools/transforms_test.clj`; L1867 commits 'cljfmt'; L1917 pushes.

## Timeline
- 08:50 L1433 commit on the stacked branch inside a worktree; no hook runs.
- 08:54 L1658 push; CI starts.
- 09:42 L1821-L1822 CI summary: Cljfmt failed (plus unrelated flakes).
- 09:43 L1837-L1850 reads logs, greps the workflow, tries the task name from a stale deps.edn comment (separate record), lists mage tasks.
- 09:43-09:44 L1858-L1867 reformat and a fix commit; 09:45 L1917 push.
- Cost: a red CI run on a PR under review, a 'cljfmt' fix commit in its history, and about six diagnosis calls.

## Root cause
`core.hooksPath` is stored in the shared `.git/config` as the relative path `.husky/_`. husky creates that directory only where it was installed (the main checkout). In a worktree the path does not exist and git treats that as 'no hooks'. Where `.husky/_` exists but node_modules does not, the same setup fails with exit 127 instead (the variant already recorded under this slug).

## Why agents fall for it
A commit that succeeds silently looks like a commit whose hooks passed. Agents assume the repo's pre-commit formatting applies in every checkout, and cljfmt is not part of the usual local kondo-and-tests loop.

## Current state
Checked 2026-09-23: `git -C ~/src/mb/metabase config --get core.hooksPath` is `.husky/_`; `~/src/mb/wt/<branch>/.husky/_` does not exist. origin/master `lint-staged.config.cjs` maps `**/*.{clj,cljc,cljs,bb}` to `./bin/mage cljfmt-files` and `./bin/mage fix-unused-requires`. Scratch repro: with `core.hooksPath=.husky/_` and no such directory, `git commit` succeeds without running anything; once the directory holds a failing hook, the commit fails.

## Suggested fix
- Store an absolute `core.hooksPath`, or run husky in each new worktree so `.husky/_` exists.
- Warn from a `post-checkout` hook when `core.hooksPath` does not exist in the new checkout.
- Until then, run `./bin/mage cljfmt-updated origin/master` before pushing from a worktree.

## Detection signal
Commits from a git worktree with no lint-staged output followed by a CI `Cljfmt` failure; `test -d "$(git config core.hooksPath)"` false inside the worktree.

## Raw excerpts
```
L1433 [CALL] cd ~/src/mb/wt/<branch> && git add src/metabase/metabot/tools/shared/content_store.clj src/metabase/metabot/tools/shared/llm_shape.clj src/metabase/metabot/tools/resources.clj src/metabase/metabot/agent/user_context.clj && git commit -q -F - <<'MSG' ...
L1658 [CALL] cd ~/src/mb/wt/<branch> && git push origin <branch> 2>&1 | tail -2 && ...
L1822 [RESULT] === PR <pr> === sdk-tests / ... === PR <pr> === backend-tests / Cljfmt	https://github.com/metabase/metabase/actions/runs/.../job/... backend-tests / be-tests-result ...
L1838 [CALL] grep -n "cljfmt" ~/src/mb/metabase/.github/workflows/backend.yml | head -5; grep -n "cljfmt" ~/src/mb/metabase/deps.edn | head -5
L1840 [RESULT] 466:  be-cljfmt: 475:      - name: Run cljfmt 476:        run: ./bin/mage cljfmt-all --force-check 485:      - be-cljfmt 789:  ;;     ./bin/mage cljfmt-all 793:  ;;     ./bin/mage cljfmt-file file1.clj file2.clj ...
L1858 [CALL] ./bin/mage cljfmt-updated origin/<base> 2>&1 | tail -20
L1859 [RESULT] Checking for updated files against origin/<base> #'cljfmt.tool/fixing src/metabase/metabot/agent/user_context.clj, ... Reformatted test/metabase/metabot/tools/transforms_test.clj
L1867 [CALL] git add test/metabase/metabot/tools/transforms_test.clj && git commit -q -m "<ticket>: cljfmt" && echo committed; ...
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/b9969651-5371-431a-b6c4-6d9916153234.jsonl
  lines: 2522-2714
  date: 2026-08-25
  jev: {any_papercut: 0.88, env_toolchain: 0.80, stale_state: 0.59, verify_mismatch: 0.63, misleading_code: 0.32, hidden_coupling: 0.77, stale_docs: 0.23, tool_footgun: 0.71, flaky: 0.94, agent_bug: 0.89, wasted_effort: 0.62, user_correction: 0.08}

- L1634 (2026-08-24): `cp $W/AdminSettingInput.tsx $W/AdminSettingInput.unit.spec.tsx $D/ && ... bun run jest ... ; git checkout -- $D/` in the main checkout.
- L2522-2530: files from the second branch copied into the main checkout; jest `1 failed, 144 passed`.
- L2571: `Unable to find an element with the text: /Leave the keys blank/`.
- L2578: the agent realizes it ran one branch's specs inside the other branch's checkout, which lacks the rest of that branch's frontend.
- L2708: `husky - command not found in PATH=node_modules/.bin:...` after `rm -f node_modules` in the worktree.

- L1634 (08-24 evening): first copy-into-main-checkout run for eslint and jest, then `git checkout -- $D/`.
- L2522-2535 (08-25 01:03): copies the second branch's type, mock and form files into the main checkout; one failure.
- L2546-2571: edits the fixture, copies again, still failing.
- L2578-2580 (01:05): realizes the checkout mismatch; `git checkout -- frontend/` in the main checkout; symlinks node_modules into the worktree.
- L2707-2714 (01:19): removes the symlink, commit fails in husky, re-symlinks, commits.
- Cost: about 16 minutes on the second branch plus a round on the first, and blanket `git checkout -- frontend/` runs in the checkout the user keeps for the dev server.

```
L1634 [CALL] Bash: cd ~/src/mb/metabase && W=~/src/mb/wt/<branch>/frontend/src/metabase/admin/settings/components/widgets && D=frontend/src/metabase/admin/settings/components/widgets && cp $W/AdminSettingInput.tsx $W/AdminSettingInput.unit.spec.tsx $D/ && timeout 600 mise exec -- bunx eslint [...]; timeout 600 mise exec -- bun run jest --silent $D/AdminSettingInput.unit.spec.tsx 2>&1 | tail -5; git checkout -- $D/
L2522 [CALL] Bash: cd ~/src/mb/metabase && cp ~/src/mb/wt/<other branch>/frontend/src/metabase-types/api/llm.ts frontend/src/metabase-types/api/llm.ts && cp [...]/mocks/llm.ts [...] && cp [...]/ProviderConnectionForm.tsx [...]
L2530 [RESULT] Test Suites: 1 failed, 14 passed, 15 total Tests:       1 failed, 144 passed, 145 total
L2571 [RESULT] ● AIProviderSettingsSection › connects with the whole Bedrock key pair or with none of it  TestingLibraryElementError: Unable to find an element with the text: /Leave the keys blank/.
L2579 [CALL] Bash: git checkout -- frontend/ && git status --short | head -3; ln -sfn ~/src/mb/metabase/node_modules ~/src/mb/wt/<other branch>/node_modules && [...]
L2707 [CALL] Bash: rm -f node_modules && git status --short | head -10; git add -A && git commit -q -m "[...]" -- src/metabase/llm/provider.clj [...] 2>&1 | tail -1; git log --oneline -1
L2708 [RESULT] [...] husky - command not found in PATH=node_modules/.bin:[...]
L2713 [CALL] Bash: ln -sfn ~/src/mb/metabase/node_modules node_modules && git check-ignore node_modules && git add -A && git commit -q -m "[...]" [...]
```
