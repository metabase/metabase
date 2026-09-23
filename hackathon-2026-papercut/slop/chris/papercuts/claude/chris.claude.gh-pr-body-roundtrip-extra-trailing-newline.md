---
title: "`gh pr view --json body --jq .body` prints one more trailing newline than the file given to `gh pr edit --body-file`, so a diff-based concurrent-edit check always fails"
slug: gh-pr-body-roundtrip-extra-trailing-newline
kind: tool-quirk
impact: wasted-time
severity: low
status: open
area: gh CLI (pr view --jq / pr edit --body-file); memory "Re-read PR desc before gh pr edit"
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-80394-metabot-tennant/f6535e97-e0e1-4040-958e-3a5295bd2b0f.jsonl (deleted; reconstructed from redacted chunks)
    lines: 337-338, 441-442, 551-558, 612-624, 640-643
    date: 2026-08-21
    jev: {self_inflicted_bug: 0.97, tool_misuse: 0.93, misleading_signal: 0.41, user_correction: 0.87, codebase_trap: 0.83, flailing: 0.36, env_friction: 0.76}
---
## Summary
The memory `feedback_reread_pr_desc_before_edit.md` says Chris edits PR descriptions concurrently. To respect it, the agent snapshotted the live body with `gh pr view 80468 --json body --jq .body > body.md` before each `gh pr edit --body-file newbody.md`, and diffed the two. After the first edit, every later diff reported `31a32 > ` (one extra blank line at the end of the live body). jq's `.body` output adds a newline after the string, and the stored body already ends in the file's own newline. This caused:
- L441-442: `diff ... && echo "body still as I set it"` exited 1. The agent had to look at the diff.
- L551-552: `diff $S/newbody.md $S/body4.md > /dev/null && perl -0pi ... && gh pr edit ...` exited 1 **silently**. The whole edit was skipped with no output, and the agent had to rerun the diff to see why (L554-555).
- L612-613: the agent tried to strip the blank line with `sed -e '$ { /^$/d }'`, which BSD sed rejects ("extra characters at the end of d command").
- L623-624: it settled on eyeballing: "exit=1 (1 with only a blank-line diff = no concurrent edit)".
- L640: a separate harness quirk. `Write` on newbody.md was refused ("File has been modified since read") because the agent had edited it with perl.

## Symptom
A false "BODY CHANGED CONCURRENTLY" signal, and an `&&` chain that silently did nothing.

## Timeline
See the lines above. First check (L337-338, before any edit by the agent) passed. Every check after the agent's own `--body-file` edit showed the extra newline.

## Root cause
`gh pr view --jq .body` prints the string followed by `\n`. `--body-file` uploads the file as-is, and it already ends in `\n`. The round trip therefore gains one newline. Byte-exact `diff` treats that as a change.

## Why agents fall for it
The memory asks for a re-read. The obvious way to compare is `diff`, and nothing warns about trailing-newline asymmetry. In an `&&` chain with `> /dev/null`, the mismatch is invisible.

## Current state
Open (gh behaviour). MEMORY.md has "[Re-read PR desc before gh pr edit] — Chris edits concurrently", with no recipe for comparing.

## Suggested fix
- Compare with `diff <(printf '%s' "$(cat a)") <(printf '%s' "$(cat b)")`: command substitution strips trailing newlines on both sides. Or use `gh pr view --json body -q .body | cmp -s - <(cat file; echo)`.
- Better: a small `~/bin/pr-body-guard` that saves the fetched body and refuses `gh pr edit` if the normalized live body differs. Mention it in the memory.

## Detection signal
- `diff` output of exactly `<N>a<N+1>` followed by `> ` (one appended blank line) after `gh pr view --json body`.
- An `&& gh pr edit` chain exiting 1 with no output.

## Raw excerpts
```
L441 [TOOL Bash] ... gh pr view 80468 --json body --jq .body > $S/body3.md; diff $S/newbody.md $S/body3.md && echo "body still as I set it"
L442 [RESULT ERROR] Exit code 1
30a31
>
L551 [TOOL Bash] ... diff $S/newbody.md $S/body4.md > /dev/null && perl -0pi -e 's/.../' $S/newbody.md && gh pr edit 80468 --body-file $S/newbody.md 2>&1 | tail -1
L552 [RESULT ERROR] Exit code 1
L613 [RESULT ERROR] sed: 1: "$ { /^$/d }": extra characters at the end of d command
L624 [RESULT] 31a32
>
exit=1 (1 with only a blank-line diff = no concurrent edit)
```
