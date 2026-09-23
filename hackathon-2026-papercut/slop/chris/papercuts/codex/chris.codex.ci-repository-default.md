# CI helper looked up a numeric PR in the wrong repository

Source: Codex session 2026-09-16, [transcript](/Users/christruter/.codex/sessions/2026/09/16/rollout-2026-09-16T18-43-10-01a0ac63-6602-7cf0-94da-3480c08d5ba4.jsonl).

Observed failure: while working in `metabase/evals`, the agent used the `ci-failures` helper with PR number 155. It selected PR 155 in `metabase/metabase` instead, an unrelated `ag-more-session-tests` PR ([line 6445](/Users/christruter/.codex/sessions/2026/09/16/rollout-2026-09-16T18-43-10-01a0ac63-6602-7cf0-94da-3480c08d5ba4.jsonl#L6445)). The agent first worked around the result with direct GitHub checks; the user asked whether this was a helper bug ([lines 6414–6424](/Users/christruter/.codex/sessions/2026/09/16/rollout-2026-09-16T18-43-10-01a0ac63-6602-7cf0-94da-3480c08d5ba4.jsonl#L6414)).

Mechanism: the helper defaults to `metabase/metabase` instead of inferring the repository from the current checkout. Numeric PR identifiers are unique only within one repository. Passing `CI_REPO=metabase/evals` corrected the lookup and showed the intended checks were clean ([line 6457](/Users/christruter/.codex/sessions/2026/09/16/rollout-2026-09-16T18-43-10-01a0ac63-6602-7cf0-94da-3480c08d5ba4.jsonl#L6457)).

Classification: confirmed tool UX papercut; wasted diagnosis time and risk of acting on an unrelated PR. The transcript records a workaround, not a fix to the helper itself.

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-evals/0311dcbb-3544-448a-b8ed-ef02bbe339ae.jsonl
  lines: 1045-1103
  date: 2026-08 (evals #105/#108 era)
  jev: {self_inflicted_bug: 0.46, tool_misuse: 0.55, misleading_signal: 0.53, user_correction: 0.80, codebase_trap: 0.75, flailing: 0.66, env_friction: 0.95}

Claude Code, evals repo. Documented-but-still-hit: an evals-project memory
(`~/.claude/projects/-Users-christruter-workspace-metabase-evals/memory/ci-retry-metabase-only.md`, dated 2026-08-06)
already said "`~/bin/ci-retry` ... look PR numbers up in `metabase/metabase`, not the current repo". The agent still
hit it via `ci-failures`, because the `pr-review` skill's CI step calls `ci-failures` by name and the memory named
only `ci-retry`. It reported "no checks reported on the 'filter_card' branch" for evals#65 (L1073). The agent
extended the memory to cover `ci-failures` (L1063).

The same `pr-review` skill also hardcoded `master` (evals uses `main`; stacked PRs use a feature branch) and told the
agent to call `Workflow({name: "code-review"})`, which does not exist -- "it always needs to take two stabs at
triggering it" (user, L1075). Both fixed in `~/.claude/skills/pr-review/SKILL.md` (now lines 27-39 derive `$BASE`
via `gh pr view --json baseRefName`; line 51 says `Skill({skill: "code-review", ...})`, "It is a skill, not a workflow").

Current state of the helper: `/Users/christruter/dotfiles/bin/bin/ci_common.clj` `(def repo ...)` still defaults to
`"metabase/metabase"` unless `CI_REPO` is set; it does not infer from the checkout's remote.
