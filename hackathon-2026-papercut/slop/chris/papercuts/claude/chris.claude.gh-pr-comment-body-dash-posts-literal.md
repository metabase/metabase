---
title: "`gh pr comment --body - <<EOF` posts a one-character comment \"-\"; stdin needs `--body-file -`, and the agent's comment-count check read it as success"
slug: gh-pr-comment-body-dash-posts-literal
kind: tool-quirk
impact: both
severity: medium
status: open
area: gh CLI (gh pr comment / gh pr create / gh issue comment), GitHub PR replies written by agents
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-stats-remote-sync/6fdcc6ed-191e-460e-8ffe-523a794c6ac7.jsonl
    lines: 771-780, 936-943, 964
    date: 2026-09-02
    jev: {self_inflicted_bug: 0.91, tool_misuse: 0.96, misleading_signal: 0.73, user_correction: 0.44, codebase_trap: 0.72, flailing: 0.40, env_friction: 0.91}
---
## Summary
The agent replied to a reviewer on metabase/evals#113 with `gh pr comment 113 --repo metabase/evals --body - <<'EOF' ... EOF`.
`--body` (`-b`) takes its argument literally, so the comment posted was the single character `-`, and the heredoc was thrown away.
Only `--body-file -` (`-F -`) reads stdin.
gh printed the new comment URL and exited 0.
The agent checked that the comment count went up (`--jq '.comments | length'` → 2) and told the user "Reply posted".
The mistake was found roughly 150 lines later, by chance, when the agent gathered review threads for another reason.

## Symptom
- The tool result shows success: `https://github.com/metabase/evals/pull/113#issuecomment-5511142410`, then `posted`, then `2`.
- The agent summary at L780 says "**Reply posted** on metabase/evals#113 — confirmed the concern, explained it fails silently...".
- On GitHub the comment from `crisptrutski` was `-` (len=1). A reviewer or the user would have seen a one-character reply under their name.

## Timeline
- L772: `gh pr comment 113 --repo metabase/evals --body - <<'EOF'` followed by a ~1.7 KB markdown reply. Then `echo "posted"; gh pr view 113 --repo metabase/evals --json comments --jq '.comments | length'`.
- L774: `https://github.com/metabase/evals/pull/113#issuecomment-5511142410` / `posted` / `2`.
- L780: the agent reports the reply as posted and summarizes its content.
- L933: while listing reviews on both PRs, the output includes `[comment] crisptrutski: -`.
- L936: "Two findings there. Let me check my own reply first — I suspect I posted it wrong."
- L938: `ID=5511142410 [crisptrutski] len=1 --- -`
- L941: "Confirmed — I posted a literal `-`. `gh pr comment --body -` takes "-" as the literal string; it needed `--body-file -`."
- L942: fixed with `gh api repos/metabase/evals/issues/comments/5511142410 --method PATCH -F body=@/tmp/reply.md`.
- L964: the agent owns up to the user: "The reply I said I'd posted went up as a literal `-`."

## Root cause
Many CLIs use `-` to mean stdin, and gh does for `--body-file`, but not for `--body`.
The two flags differ by one word, and `-b -` is a legal value that gh accepts silently.
gh does not warn about a body that is exactly `-`, and it does not warn when stdin is a pipe or heredoc but the command never reads it.

## Why agents fall for it
- The model's prior is that `-` means stdin everywhere.
- The command succeeds and prints a comment URL, which looks like proof.
- The agent's own check was structural (the comment count went up), not a check of the content. That is the same false signal.
- Heredoc plus `--body` looks natural next to `gh pr create --body "$(cat <<EOF ...)"`, which is a common and correct pattern.

## Current state
- This is still how gh behaves (`gh pr comment --help`: `-b, --body text` / `-F, --body-file file  Read body text from file (use "-" to read from standard input)`). The same applies to `gh pr create`, `gh pr edit`, `gh issue comment`, and `gh pr review`.
- None of CLAUDE.md, the skills, or memory warn about it. Memory has `reference_gh_review_posting_mechanics.md` about review posting, which is a different topic.
- In the same session the agent used `--body-file /tmp/x.md` for `gh pr edit` and `-F body=@file` for `gh api`, and both worked.

## Suggested fix
- Add a PreToolUse hook on Bash that rejects `gh (pr|issue) (comment|create|edit|review)` with `--body -` or `-b -` and suggests `--body-file -`.
- Add a line to the gh posting memory: "Post long bodies with `--body-file <file>`, then read back with `gh api .../comments/<id> --jq .body`."
- The pr-review / pr-rereview skills could require a read-back of the posted body.

## Detection signal
- A regex on Bash commands: `gh\s+(pr|issue)\s+\S+.*\s(--body|-b)\s+-(\s|$)`.
- The result of a posting command followed by a read that shows `len=1` or a body equal to `-`.
- In general, a "posted" claim with no later read of the posted content (`gh api ... --jq .body`).

## Raw excerpts
```
L772 [TOOL Bash] cd ~/workspace/metabase/evals
gh pr comment 113 --repo metabase/evals --body - <<'EOF'
> Production keys definitions only by metric, but these views join on metric and version. Therefore, a version bump would hide historical rows, no?

Confirmed, and worse than "hide" suggests — it fails silently, because an `INNER JOIN` just yield …
EOF
echo "posted"; gh pr view 113 --repo metabase/evals --json comments --jq '.comments | length' 2>&1
L774 [RESULT] https://github.com/metabase/evals/pull/113#issuecomment-5511142410
posted
2
```
```
L937 [TOOL Bash] gh api "repos/metabase/evals/issues/113/comments" --jq '.[] | "ID=\(.id) [\(.user.login)] len=\(.body|length)\n---\n\(.body)\n===="'
L938 [RESULT] ID=5497234208 [andreis] len=145
---
Production keys definitions only by metric, but these views join on metric and version. ...
====
ID=5511142410 [crisptrutski] len=1
---
-
====
L941 [ASSISTANT] Confirmed — I posted a literal `-`. `gh pr comment --body -` takes "-" as the literal string; it needed `--body-file -`. Fixing it:
```
