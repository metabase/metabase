---
title: The agent re-created work that already sat in an open PR (evals#113) in a different repo without opening that PR, and copied in the defect its reviewer had already flagged
slug: reimplemented-open-pr-without-reading-its-reviews
kind: agent-behaviour
impact: both
severity: medium
status: open
area: cross-repo work (stats-remote-sync data app, metabase/data-stack DDL, metabase/evals#113)
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-stats-remote-sync/6fdcc6ed-191e-460e-8ffe-523a794c6ac7.jsonl
    lines: 92-102, 243, 268-333, 610-704, 946-958
    date: 2026-09-02
    jev: {self_inflicted_bug: 0.80, tool_misuse: 0.93, misleading_signal: 0.84, user_correction: 0.21, codebase_trap: 0.79, flailing: 0.55, env_friction: 0.88}
---
## Summary
The data app's README on branch `-local-install` said to provision the app views "from the [`metabase/evals` analytics contract](https://github.com/metabase/evals/pull/113)" (read at L93-102).
The agent found that the 8 `eval_app_*` views were missing on stats. Instead of following that link, it recovered the view SQL from an old branch, wrote a new DDL file in **data-stack**, validated it, and got tests passing (L268-333).
The user asked "huh, we didn't already merge that stuff?" (L610), then "is this on evals or on data-stack? is that the right repo? what about the comments" (L682).
Only then did the agent open evals#113. It was still open, with the byte-identical view SQL and a reviewer comment (andreis): "Production keys definitions only by metric, but these views join on metric and version. Therefore, a version bump would hide historical rows, no?"
L698: "That review comment is a real defect, and I just ported it into data-stack."
A second reviewer thread (inline, `analytics/README.md:13`, "Production loads `raw_evals`, while these app views read `evals`") went unseen until L946, because `gh pr view --json comments,reviews` doesn't return inline review comments. Those need `gh api repos/.../pulls/N/comments`.

## Symptom
Two user corrections, a ported defect, and a stretch of duplicated work in the wrong repo. The data-stack placement turned out to be right, but only by accident, and the duplicate forced a later rescope of #113.

## Timeline
- L93-102: the README's Metabase cutover section says: "Provision the canonical tables and app views from the [`metabase/evals` analytics contract](https://github.com/metabase/evals/pull/113)".
- L243: "I don't know whether the 8 `eval_app_*` views exist ... `data-stack/sources/evals/ddl/raw_evals.sql` doesn't create them".
- L268: "The 8 views genuinely aren't on stats. Let me write the DDL to create them, following data-stack's conventions."
- L610 USER: "huh, we didn't already merge that stuff?"
- L613-626: the agent finds commits "Own ClickHouse analytics contract in evals" and PR #113, which is OPEN. "Let me see what it actually contains, since I may have just duplicated it in the wrong repo."
- L682 USER: "is this on evals or on data-stack? is that the right repo? what about the comments"
- L693: the review comment. L698: "That review comment is a real defect, and I just ported it into data-stack."
- L920-948: collecting reviews turns up a second, inline thread nobody had answered. `gh pr view --json reviews,comments` had shown only the issue-level comment.

## Root cause
Agent behaviour: a pointer to prior work (a PR link in the README it had just read) wasn't followed before writing new code, and the agent never looked for open PRs touching the same artifact.
Contributing tool quirk: `gh pr view --json comments,reviews` omits inline review comments (diff-anchored threads). Agents that check "what about the comments" with it get an incomplete picture.

## Why agents fall for it
- The immediate problem ("views missing on stats") has an obvious local fix, and the repo that owns the loader (data-stack) looks like the natural home.
- A PR link inside a README reads as background, not as "this work is in flight".
- `gh pr view --json comments,reviews` looks complete.

## Current state
Nothing prompts a search for open PRs before starting cross-repo work. The pr-review / pr-rereview skills fetch inline comments via `gh api` (check), but ad-hoc sessions don't.

## Suggested fix
- Memory or CLAUDE note: "Before adding an artifact (DDL, view, module) found missing, search open PRs in the owning repos (`gh pr list --search <name> --state open` across the relevant repos) and follow any PR links in nearby READMEs. Read their review threads, including inline ones via `gh api repos/O/R/pulls/N/comments`."
- A shared helper that prints issue comments, reviews, *and* inline review comments for a PR.

## Detection signal
- A tool result earlier in the session contains a `github.com/<org>/<repo>/pull/<n>` link, and the agent then creates files implementing the same artifact names without ever running `gh pr view <n>`.
- `gh pr view --json comments,reviews` used as the only source for "review comments".

## Raw excerpts
```
L102 [RESULT] 2. Sync the ClickHouse database in Metabase and publish the app sources.
3. Export the Data-library TypeScript schema.
...
L93 ... 1. Provision the canonical tables and app views from the
   [`metabase/evals` analytics contract](https://github.com/metabase/evals/pull/113).
```
```
L623 [RESULT] === PR 113 ===
{"baseRefName":"main","headRefName":"codex/clickhouse-analytics-contract","mergedAt":null,"number":113,"state":"OPEN","title":"Own ClickHouse analytics contract in evals"}
L626 [ASSISTANT] PR #113 is **open, never merged** — that's your answer. Let me see what it actually contains, since I may have just duplicated it in the wrong repo.
...
L693 [RESULT] === COMMENTS ===
--- Production keys definitions only by metric, but these views join on metric and version. Therefore, a version bump would hide historical rows, no?
L698 [ASSISTANT] That review comment is a real defect, and I just ported it into data-stack. Let me verify it against prod.
```
```
L964 [ASSISTANT] ## Two review comments on #113, not one
I'd only seen the metric/version one. There was a second, inline on `analytics/README.md:13`, never answered:
> Production loads `raw_evals`, while these app views read `evals`. What populates the views before cutover?
```
