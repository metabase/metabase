---
title: Memory note recommending `--no-verify` led agents to bypass pre-commit hooks preemptively, without observing a hook failure
slug: memory-no-verify-workaround-invites-preemptive-hook-bypass
kind: agent-behaviour
impact: both
severity: medium
status: documented-still-hit
area: ~/.claude/.../memory/project_fix_unused_requires_pod_crash.md, MEMORY.md index line, git commit hooks (husky + lint-staged + mage fix-unused-requires)
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/6da9d86f-a923-4553-b05f-b4e4e363b231.jsonl
    lines: 871-916
    date: 2026-09-02
    jev: {self_inflicted_bug: 0.78, tool_misuse: 0.60, misleading_signal: 0.60, user_correction: 0.97, codebase_trap: 0.75, flailing: 0.32, env_friction: 0.72}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-search-delete-00-memoize-model-hooks/bc72fc8d-5805-4236-9f38-c525a085b500.jsonl
    lines: 150-900 (every commit in the session used --no-verify, e.g. L357; no hook failure observed first)
    date: 2026-08-17
    jev: {self_inflicted_bug: 0.85, tool_misuse: 0.89, misleading_signal: 0.63, user_correction: 0.44, codebase_trap: 0.61, flailing: 0.56, env_friction: 0.88}
---
## Summary
MEMORY.md's index entry reads "[fix-unused-requires pod crash](project_fix_unused_requires_pod_crash.md) — dies on `:clj-kondo/ignore`; `--no-verify`". Agents read "`--no-verify`" as the recipe. In session 6da9d86f the agent committed with `git -c core.hooksPath=/dev/null commit` before any hook had failed; it later admitted "a preemptive bypass on the strength of a note about the fix-unused-requires pre-commit hook crashing. That was me assuming a failure instead of observing one", then redid the commit with hooks, which passed. In bc72fc8d the agent ran `git commit --no-verify --fixup` for a test file. The memory file itself warns that `--no-verify` skips cljfmt too and let an indentation fault reach CI on two PRs, but that warning is not in the index line.

## Symptom
```
L871 git -c core.hooksPath=/dev/null commit -q -F - <<'EOF' ...
L882 [ASSISTANT] I bypassed the hooks preemptively — let me check what they'd have done rather than leave that unverified.
L899 [ASSISTANT] Rather than leave that assumed, let me redo the commit with the hooks actually running — nothing is pushed yet.
L900 git reset --soft HEAD~1; git commit ...   (hooks ran, passed)
bc72fc8d L357 git add test/metabase/search/models_test.clj && git commit --no-verify --fixup 24ed5dfe3a1
```

## Root cause
A workaround captured as a terse index line is stronger than the caveats in the body. The crash is conditional (only when staged files carry `:clj-kondo/ignore` and the pod path trips), but the index reads unconditional.

## Why agents fall for it
Agents load MEMORY.md every session and only open the linked file when they think they need it. The index line pattern-matches "committing Clojure" and supplies the flag.

## Current state
Memory index line unchanged (MEMORY.md: "dies on `:clj-kondo/ignore`; `--no-verify`"). The body (project_fix_unused_requires_pod_crash.md) has the "Cost of the workaround" paragraph. Unknown whether the pod crash still reproduces on master.

## Suggested fix
- Rewrite the index line: "commit normally; only if the hook actually crashes with `Invalid token: <vector:`, use `--no-verify` then `./bin/mage cljfmt-updated master`".
- Better: fix or guard `mage fix-unused-requires` so the workaround is unnecessary, and delete the memory.

## Detection signal
`--no-verify` or `core.hooksPath=/dev/null` in a commit command with no preceding failed commit in the transcript.

## Raw excerpts
```
L916 [ASSISTANT] I also initially committed with `core.hooksPath=/dev/null` — a preemptive bypass on the strength of a note about the `fix-unused-requires` pre-commit hook crashing. That was me assuming a failure instead of observing one. I undid it with `reset --soft` and recommitted with hooks enabled: they passed, and I verified the resulting diff is byte-identical to the bypassed one
```

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-kondo-ratchets-merge-script/a0ba828b-731a-40b4-ac34-8be70d1da238.jsonl
  lines: 197, 366, 439, 519, 559, 670, 711, 744, 800, 833, 923
  date: 2026-08-31
  jev: {self_inflicted_bug: 0.89, tool_misuse: 0.96, misleading_signal: 0.51, user_correction: 0.79, codebase_trap: 0.69, flailing: 0.46, env_friction: 0.76}

Every commit in this session used `git -c core.hooksPath=/dev/null commit ...` from the first one (L197), in
worktrees that did have node_modules (L468-473 shows `node_modules` with jest present). No hook failure was ever
observed. One of the bypassed commits added `.github/scripts/file-paths.unit.spec.ts` with a type error (TS2456) that
CI's fe-type-check caught (see `jest-swc-passes-but-tsc-fails-github-scripts-spec`); lint-staged would not
necessarily have type-checked it, but the bypass removed every local backstop. Same session, the agent also said
"Amending was safe — the commit was never pushed" (L420), so it was reasoning about git safety while treating
hook bypass as the default.

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-pr-03-llm-config/93bd1b32-5bde-4582-9d8a-53740b3387ef.jsonl
  lines: 1013, 1171, 1474, 2182, 3075, 3266, 3566, 4036-4070, 4132, 4418-4428
  date: 2026-08-29/30
  jev (chunk 13, 3951-4305): {self_inflicted_bug: 0.65, tool_misuse: 0.95, misleading_signal: 0.83, user_correction: 0.94, codebase_trap: 0.73, flailing: 0.47, env_friction: 0.54}
  jev (chunk 14, 4270-4459): {self_inflicted_bug: 0.78, tool_misuse: 0.94, misleading_signal: 0.67, user_correction: 0.07, codebase_trap: 0.87, flailing: 0.66, env_friction: 0.92}
- **This one reached CI.** Every commit and amend in a two-day, four-branch session used `git commit --no-verify` (e.g. L1013 `git commit --no-verify -F -`, L1171 `git commit --amend --no-verify`), and no hook failure was ever observed first. After the PRs left draft, CI failed `backend-tests / Cljfmt` on #79979 and #79980 (L4039). The cause was a pure-indentation fault in `osi_generation/settings_test.clj` that the pre-commit `mage cljfmt-files` step would have fixed. L4043 ASSISTANT: "I caused both by using `--no-verify`... I'd been using `--no-verify` reflexively after the `fix-unused-requires` pod crash noted in my memory, without weighing what else it skips." Fixed with `./bin/mage cljfmt-updated master` (L4055).
- L4426-4428: the agent appended a "Cost of the workaround (2026-08-30)" paragraph to `project_fix_unused_requires_pod_crash.md` (the paragraph the earlier entry's Current state mentions). The MEMORY.md index line still reads "dies on `:clj-kondo/ignore`; `--no-verify`".
- Same session also missed the separate Eastwood test gate; see `eastwood-source-alias-skips-changed-tests-gate`.
