---
title: GNU-only flags fail on macOS BSD tools mid-script, and `git add -A && git-spice rebase continue` commits the half-written file (conflict markers included)
slug: bsd-tools-silent-failure-commits-conflict-markers
kind: env-friction
impact: introduced-bug
severity: high
status: open
area: macOS userland (head, sed, grep \b) + git-spice rebase continue + ~/bin/restack-branches
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-uxw-4796-preliminary-cleanups/584db19f-a406-43a1-b9f1-5db9a68c5e28.jsonl
    lines: 1900-1985, 2718-2730
    date: 2026-09-08
    jev: {self_inflicted_bug: 0.97, tool_misuse: 0.90, misleading_signal: 0.68, user_correction: 0.55, codebase_trap: 0.72, flailing: 0.70, env_friction: 0.89}
---
## Summary
While resolving a restack conflict by splicing a block into the file with a shell pipeline, the agent
used `head -n -1` (GNU-only; BSD `head` rejects negative counts). The pipeline failed, the temp file
was mangled (the replacement block ended up at the top of the file, the conflict region stayed), and
the same compound command then ran `git add -A && git-spice rebase continue` and
`~/bin/restack-branches --onto-trunk`. Git accepted the file as resolved, committed it with conflict
markers, and restack-branches rebased the next branch on top of it and reported "restacked".
A second, separate BSD/GNU miss in the same session: `git grep "/$v\b"` returned zero hits for every
var (no `\b` in git grep's default regex), so an "unused publics" sweep reported everything as unused.

## Symptom
```
L1909 [RESULT] head: illegal line count -- -1
test/metabase/search/appdb/index_test.clj:863:<<<<<<< HEAD
test/metabase/search/appdb/index_test.clj:868:||||||| parent of 087af61782c (...)
test/metabase/search/appdb/index_test.clj:874:>>>>>>> 087af61782c (...)
test/metabase/search/appdb/index_test.clj:876:61: error: Unmatched bracket: unexpected )
...
  uxw-4796-remove-ambient-lease-path     restacked
  uxw-4796-reindex-freshness-gauge       restacked
```
The kondo "Unmatched bracket" error and the marker grep printed in the same output as "restacked".

## Timeline
- L1900: restack stops with a conflict in `test/metabase/search/appdb/index_test.clj`.
- L1908: one compound command: write a block file, splice with awk/`head -n -1`, `clj-kondo --lint`,
  `git add -A && git-spice rebase continue`, `restack-branches --onto-trunk`. No `set -e`, no check
  between steps.
- L1909: `head: illegal line count -- -1`; markers still present; commit made; upstack restacked.
- L1918 ASSISTANT: "That `head -n -1` failed on BSD and I committed the mangled file. Fixing it now."
- L1930-1965: file starts with the spliced comment (line 1), 876 lines, markers in HEAD.
- L1968: amend; L1971 re-restack; sweep all four branches for markers.
- L1985 ASSISTANT: "my shell script failed silently on BSD `head`, and I ran `git add -A` without checking, so I committed a file with conflict markers in it."
- L2718-2728: `git grep -c "/$v\b"` -> every public var reported as having no external caller;
  ASSISTANT: "That check was broken -- `\b` isn't supported there, so everything read as zero."

## Root cause
- macOS ships BSD `head`/`sed`/`grep`; GNU forms (`head -n -N`, `sed -i` without `''`, `\b` in BRE)
  either error or silently match nothing.
- `git add` marks a conflicted file resolved regardless of content; `git-spice rebase continue` (and
  plain `git rebase --continue`) do not check for conflict markers. `restack-branches` then continues
  upstack without validating the tree either.

## Why agents fall for it
Agents default to GNU coreutils idioms. Chaining the "resolve -> add -> continue -> restack upstack"
steps in one command for efficiency means a failure in step 1 doesn't stop steps 3-4. The tools
report success ("restacked") even though the lint line two rows up says "Unmatched bracket".

## Current state
Open. No marker check in ~/bin/restack-branches (grep for `<<<<<<<` finds nothing). Git's own
`git diff --check` would catch markers but nothing runs it. No CLAUDE.md or memory mentions BSD vs GNU
tool differences. (The repo pre-commit `hooks/pre-commit.nocommit` would not run on
`rebase --continue` commits either way, and in this session hooks were bypassed with `--no-verify`.)

## Suggested fix
- `restack-branches`: before `git-spice rebase continue` / after each branch, run
  `git diff --check <base>..HEAD` or `git grep -nE '^(<<<<<<<|>>>>>>>)' HEAD` and refuse to continue.
- Install GNU coreutils (`brew install coreutils`) and put `gnubin` first on the agent PATH, or document
  "macOS BSD tools: no `head -n -N`, `sed -i ''`, no `\b` in git grep (use `-w` or `-P`)" in CLAUDE.md.
- Agent guidance: never chain `git add -A && rebase continue` onto an unverified edit; resolve with the
  Edit tool, not text splicing.

## Detection signal
- Tool result containing `head: illegal line count`, `sed: 1: ... invalid command code`, or
  `Unmatched bracket` in the same output as `rebase continue` / `restacked`.
- Any commit whose tree contains `^<<<<<<< ` / `^>>>>>>> ` (a post-commit or pre-push check).
- A "count" loop that returns zero for every item (uniform-zero result) should be flagged as suspect.

## Raw excerpts
```
L1908 [TOOL Bash] SP=.../scratchpad
cat > "$SP/block.clj" <<'EOF'
                                    ;; An entry needs a column beyond t ...
... (awk splice using head -n -1) ...
clj-kondo --lint test/metabase/search/appdb/index_test.clj 2>&1 | tail -2
git add -A && git-spice rebase continue 2>&1 | tail -4
~/bin/restack-branches --onto-trunk 2>&1 | tail -6
L1964 [TOOL Bash] git grep -c -E '^(<<<<<<<|>>>>>>>)' HEAD -- test/metabase/search/appdb/index_test.clj || echo "  none"
L1965 [RESULT] HEAD:test/metabase/search/appdb/index_test.clj:2
=== HEAD file line count ===
     876
=== HEAD first line ===
                                    ;; An entry needs a column beyond the conflict target, or the Postgres upsert
```

## Related
- `chris.claude.zsh-and-bsd-shell-quirks.md` covers BSD flag failures in general; this file is about the
  consequence when the failure sits upstream of `git add -A && git-spice rebase continue` / `restack-branches`.
- `chris.claude.zsh-and-bsd-shell-quirks.md` Additional occurrence (batch b0) has the zsh half of the same session.

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-slackbot-uploads-cleanup/1843e5b3-3fe3-44ac-9b08-6979092176bc.jsonl
  lines: 154-259
  date: 2026-09-12 (approx.; rebase onto master after SEC-1218 #82320)
  jev: {self_inflicted_bug: 0.94, tool_misuse: 0.87, misleading_signal: 0.66, user_correction: 0.14, codebase_trap: 0.54, flailing: 0.80, env_friction: 0.91}

Same outcome by a different route. The agent was rebasing `slackbot-uploads-cleanup` onto master. Commit 1 conflicted in `.clj-kondo/config/modules/config.edn` (generated), `src/metabase/slackbot/api.clj`, and `uploads.clj`. The agent resolved the two source files (with heredoc/Python rewrites) and then ran `git add -A && git rebase --continue` (L202). The generated modules config still had its conflict markers, and `git add -A` staged it as resolved, so commit 1 was written with `<<<<<<< HEAD ... ||||||| parent of b9d8ba610a3 ... >>>>>>>` at config.edn:2494-2580.
The rebase then stopped on an `index.lock` race (L203), and the next conflict (L216-220) showed the markers. `git checkout --ours` "Updated 0 paths" (L229) because the file was no longer unmerged; the markers were in HEAD. L240: `=== in HEAD commit === 1`. L243: "I made an error — commit 1 got committed with conflict markers in the kondo config. Restarting the rebase cleanly (rerere will replay my resolutions)". `git rebase --abort`, restart, rerere replayed the source resolutions, and config.edn was taken `--ours` then regenerated.
Nothing in the pre-commit path blocked it: the lint-staged hook doesn't check `.edn` for conflict markers, and git doesn't either. Detection: `git add -A` (or `git add .`) in the same command as `rebase --continue` / `cherry-pick --continue`. A pre-commit `git diff --cached --check`, which flags conflict markers, would have stopped it.
For generated files like `.clj-kondo/config/modules/config.edn`, the resolution should be "take either side, then `./bin/mage fix-modules-config`", never hand-merging. CLAUDE.md mentions `fix-modules-config` but not rebase conflicts in that file.
