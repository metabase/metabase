---
title: The Bash tool runs every command as `eval '…' && pwd -P >| …`, so `set -e` never aborts a script: a failed step is skipped over and later steps run on unmodified inputs
slug: set-e-ignored-in-bash-tool-eval-chain
kind: tool-quirk
impact: wasted-time
severity: medium
status: open # reproduced 2026-09-23: `set -e; false; echo after` still prints "after" in the Bash tool
area: Claude Code Bash tool (zsh wrapper); multi-step verification scripts such as mutation harnesses
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/ea892f4f-4e3c-479f-b370-880a3afe35e8/subagents/agent-a058f782845ea42c2.jsonl
    lines: 83-99
    date: 2026-09-03
    jev: {any_papercut: 0.84, env_toolchain: 0.90, stale_state: 0.29, verify_mismatch: 0.45, misleading_code: 0.27, hidden_coupling: 0.49, stale_docs: 0.29, tool_footgun: 0.85, flaky: 0.19, agent_bug: 0.63, wasted_effort: 0.62, user_correction: 0.05}
---
## Summary
A review subagent wrote a `set -e` script to mutation-test a React component: copy it to the scratchpad, patch the copy with `sed`, diff it, then run jest against it. Both `sed` edits failed, yet the script carried on, printed an empty diff and launched jest on the unpatched copy. Only an unrelated jest config error stopped it from reporting a PASS that would have read as "the new test does not catch the regression". The harness evaluates each command on the left of an `&&` list, where errexit is suppressed.

## Symptom
L83 starts with `set -e`, then two `sed -i ''` edits, `diff`, a scratch jest config and the jest run. L84: `gsed: can't read s#…#: No such file or directory` twice, then `=====MUTATION DIFF=====` with nothing under it, then the jest invocation: execution continued past both failures.

## Timeline
- L83: mutation script with `set -e`, two `sed -i ''` edits, diff, scratch jest config, jest run.
- L84: both edits fail; the empty diff and the jest run still execute (jest then dies on an unrelated `<rootDir>` error).
- L90: the agent blames sed syntax only; nothing says `set -e` was inert.
- L91-L99: rewritten with perl, two more runs before the mutant actually loads (see the jest projects record).
- Cost: one wasted run, and a harness that could have produced a false "test does not discriminate" finding.

## Root cause
The tool runs `/bin/zsh -c 'source <snapshot> … && eval '<cmd>' < /dev/null && pwd -P >| /tmp/claude-…-cwd'`. Shells ignore errexit for commands on the left of `&&`, so `set -e` inside the eval is on (`[[ -o errexit ]]` reports it) but never fires.

## Why agents fall for it
`set -e` is the standard way to say "stop on the first failure" and works in any normal script or terminal. The option even reads as set, and the output gives no hint that it was ignored, so agents trust later steps.

## Current state
Reproduced on 2026-09-23 in the Bash tool: `set -e; [[ -o errexit ]] && echo on; false; echo after` prints both lines. `ps` shows the wrapper as `eval '…' < /dev/null && pwd -P >| /tmp/claude-<n>-cwd`.

## Suggested fix
- Harness: run the user command as a standalone statement (`eval '…'; rc=$?; pwd -P >| …; exit $rc`) so errexit works.
- Until then, treat inline `set -e` as inert: chain with `&&`, or write the script to a file and run `zsh -e file`.
- Verification scripts should assert their own preconditions, for example fail when a mutation diff is empty.

## Detection signal
A Bash call containing `set -e` or `set -euo pipefail` whose output shows an error line followed by output from later steps; more simply, any inline `set -e` in a Bash tool call.

## Raw excerpts
```
L83 [CALL Bash] set -e ⏎ WT=~/src/mb/wt/<branch> ⏎ S=$SCRATCH ⏎ mkdir -p "$S" ⏎ cp "$WT/frontend/src/metabase/monitor/components/MonitorLayout/MonitorLayout.tsx" "$S/MonitorLayout.mut.tsx" ⏎ sed -i '' 's#import { MonitorContent } from "./MonitorContent";#…#' "$S/MonitorLayout.mut.tsx" ⏎ sed -i '' 's#P.string.startsWith(Urls.monitorAiAuditingConversations())#Urls.monitorAiAuditingConversations()#' "$S/MonitorLayout.mut.tsx" ⏎ echo "=====MUTATION DIFF=====" && diff … || true ⏎ …
L84 [RESULT] gsed: can't read s#import { MonitorContent } from "./MonitorContent";#…#: No such file or directory ⏎ gsed: can't read s#P.string.startsWith(Urls.monitorAiAuditingConversations())#Urls.monitorAiAuditingConversations()#: No such file or directory ⏎ =====MUTATION DIFF===== ⏎ =====SCRATCH CONFIG===== ⏎ … ⏎ =====MUTATION RUN===== ⏎ $ jest --maxWorkers=4 --config "$SCRATCH/jest.mut.config.js" … ⏎ ● Validation Error: ⏎   Module @swc/jest in the transform option was not found.
```
