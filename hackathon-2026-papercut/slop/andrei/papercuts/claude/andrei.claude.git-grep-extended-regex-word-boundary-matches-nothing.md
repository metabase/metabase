---
title: On macOS, `git grep -E 'name\b'` silently matches nothing (exit 1) while BRE, `-P`, `-w` and `/usr/bin/grep -E` all match, so a reviewer three times concluded a definition did not exist and grepped an empty file name
slug: git-grep-extended-regex-word-boundary-matches-nothing
kind: tool-quirk
impact: wasted-time
severity: medium
status: open # Apple Git behaviour
area: git grep on macOS (Apple Git); regex patterns with `\b`
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/e2e06b7e-9fb4-4996-834f-51e03a49a048.jsonl
    lines: 245-277
    date: 2026-09-07
    jev: {any_papercut: 0.77, env_toolchain: 0.46, stale_state: 0.28, verify_mismatch: 0.76, misleading_code: 0.31, hidden_coupling: 0.82, stale_docs: 0.29, tool_footgun: 0.49, flaky: 0.68, agent_bug: 0.87, wasted_effort: 0.55, user_correction: 0.83}
---
## Summary
Looking for where `getSettings` is defined, the reviewer ran `git grep -n -E 'export const getSettings\b|export function getSettings\b'` three times across calls. Each returned nothing, so `f=$(git grep -l …)` was empty and the follow-up grep printed "grep: : No such file or directory". A plain `git grep -n 'getSettings'` in the same command finally showed `selectors.ts:32:export const getSettings`. Agents often switch to `git grep` because the Bash tool's grep shell function is unreliable, so the workaround carries its own silent-empty trap.

## Symptom
L246 and L277: `--- getSettings: ⏎ grep: : No such file or directory`; L266 `--- getSettings def:` with no lines; L277 plain git grep shows the definition while `def in:` stays empty.

## Timeline
- L245-L246: ERE `\b` query empty; empty filename passed on.
- L265-L266: second ERE variant `(const|function) getSettings\b`, empty.
- L276-L277: plain pattern finds `selectors.ts:32`; ERE variant still empty.
- Cost: three calls and a moment of "is it defined somewhere else?" during a review.

## Root cause
Apple Git's `-E` uses the platform POSIX extended regex library, where `\b` is not a word boundary; the pattern matches nothing without an error. BSD grep and git's BRE mode accept `\b`, and `-P` or `-w` work.

## Why agents fall for it
`\b` works in GNU grep, ripgrep, BSD grep and git grep on Linux; an empty result reads as "not defined here", and git grep is the usual fallback precisely because it is trusted.

## Current state
Reproduced 2026-09-23 in a scratch repo with git 2.54.0 (Apple Git-157): `git grep -n -E 'getSettings\b'` → exit 1, no output; `git grep -n 'getSettings\b'`, `git grep -P …`, `git grep -w -E …` and `/usr/bin/grep -E 'getSettings\b'` all match.

## Suggested fix
- With git grep on macOS use `-w` or `-P`, never `-E` with `\b`.
- Or set `grep.patternType=perl` in the checkout's git config so `\b` behaves everywhere.

## Detection signal
`git grep … -E` with `\b` in the pattern followed by empty output, or `grep: : No such file or directory` from an empty `$(git grep -l …)`.

## Raw excerpts
```
L245 [CALL Bash] … echo "--- getSettings:"; git grep -n -E 'export const getSettings\b|export function getSettings\b' HEAD -- frontend/src/metabase/settings | head -3; f=$(git grep -l -E 'export const getSettings\b|export function getSettings\b' HEAD -- frontend/src/metabase/settings | head -1 | sed 's/^HEAD://'); /usr/bin/grep -n -B2 -A8 -E '…' "$f" …
L246 [RESULT] … --- getSettings: ⏎ grep: : No such file or directory ⏎ …
L265 [CALL Bash] echo "--- getSettings def:"; git grep -n -E 'export (const|function) getSettings\b' HEAD -- frontend/src | head -3; …
L266 [RESULT] --- getSettings def: ⏎ --- emptyEntitiesState: ⏎ 53:const emptyEntitiesState = (): EntitiesState => ({ …
L276 [CALL Bash] … echo "--- getSettings export chain:"; git grep -n 'getSettings' HEAD -- frontend/src/metabase/settings/index.ts frontend/src/metabase/settings/selectors.ts 2>/dev/null | head -5; f=$(git grep -l -E '(const|function) getSettings\b' HEAD -- frontend/src/metabase/settings | head -1 | sed 's/^HEAD://'); echo "def in: $f"; …
L277 [RESULT] … --- getSettings export chain: ⏎ HEAD:frontend/src/metabase/settings/index.ts:17:  getSettings, ⏎ … ⏎ HEAD:frontend/src/metabase/settings/selectors.ts:32:export const getSettings = (state: State): EnterpriseSettings => ⏎ def in: ⏎ grep: : No such file or directory
```
