---
title: "git log --since on master stops early (committer dates aren't monotonic), and a bare --since=YYYY-MM-DD means that day at the current time of day"
slug: git-log-since-window-on-squash-master
kind: tool-quirk
impact: introduced-bug
severity: medium
status: open
area: git date windows in repo tooling (mage/src/mage/kondo_ratchet_report.clj, any "last week on master" report)
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/48981bba-503a-49e5-a945-9a5c51572a3a.jsonl
    lines: 190-283
    date: 2026-09-14/15
    jev: {self_inflicted_bug: 0.87, tool_misuse: 0.81, misleading_signal: 0.60, user_correction: 0.75, codebase_trap: 0.69, flailing: 0.42, env_friction: 0.56}
---
## Summary
The agent built `mage kondo-ratchets-report`, a weekly Slack summary of who added or removed kondo
suppressions on master. Its first version picked the week's commits with `git log --since ... --until`,
and the output silently dropped commits. Two separate git behaviours caused it:
1. **Non-monotonic dates.** `git log` walks history and, with `--since`, stops at the first commit older
   than the cutoff. On master, squash/merge commits keep committer timestamps from other timezones and
   from rebased PRs, so an older-dated commit can sit above newer ones. The walk stopped before
   reaching in-window commits (`af35f7f0af7`, `34863099c0e` on 2026-08-17 were missing from the 08-17 → 08-26 window).
2. **Bare dates.** `git rev-parse --since=2026-08-17` → `--max-age=1787008096`, which is
   **Mon Aug 17 19:08:16 EDT**: the given day at the *current* time of day, not midnight. Commits from
   earlier that day fell outside the window.

## Symptom
The report left out PRs that the agent had classified by hand earlier in the session. L223 THINKING:
"#77673 and #80003 are missing from the 08-17 window".

## Timeline
- L190 first run of the prototype: results "close to expected".
- L223 two PRs are missing from a window.
- L224-237 `git log --format='%h %cd' --since=2026-08-17 --until='2026-08-26 23:59'`. The output ends at `c883033bb6d 2026-08-18 09:37:11 +1000`, after `f6e9cd0a580 2026-08-17 23:38:59 +0000`, and dates go up and down.
- L240 THINKING: "`git log --since` cuts off early because squash-merge commits on master aren't strictly ordered by date. I'll switch to selecting the time window from a first-parent walk instead."
- L241 rewrite: `window` = first-parent walk plus a per-commit epoch filter; `epoch-seconds` via `git rev-parse --since=`.
- L273-278 `af35f7f0af7` still missing; `git rev-parse --since=2026-08-17` → `--max-age=1787008096` → `Mon Aug 17 19:08:16 EDT 2026`, while the commit is `1786995853 Mon Aug 17 13:44:13 2026 -0600`.
- L282 fix: append `" 00:00"` to bare `YYYY-MM-DD` dates. Comment: ";; git reads a bare date as that day at the current time of day".

## Root cause
git's date-limiting is a heuristic (it stops walking on old dates, see `git log --since` docs), and
approxidate reads a bare date as "that day, now-o'clock". Both are documented git behaviour. Both are
unexpected for a "commits in this week" query.

## Why agents fall for it
`git log --since=X --until=Y` is the obvious idiom. On a linear, single-timezone history it works, and
the dropped commits are quiet omissions. The agent caught it only because it had a hand-made answer to
compare against.

## Current state
The fixed logic is in the untracked `mage/src/mage/kondo_ratchet_report.clj` in the main checkout (git
status shows `?? mage/src/mage/kondo_ratchet_report.clj` and its test). It is not on master. No
CLAUDE.md or memory note about git date windows.

## Suggested fix
- For "commits in window" on master: `git rev-list --first-parent <rev>`, then filter by `%ct` in code. Or use `--since-as-filter=<date>` (git ≥ 2.37), which filters without stopping the walk.
- Always give a time with the date (`"2026-08-17 00:00"`), or use epoch seconds.
- Add a memory line next to the git replay notes in ~/.claude/CLAUDE.md.

## Detection signal
- `git log --since=` / `--until=` on a merge-heavy branch in tooling code or report scripts.
- A bare `YYYY-MM-DD` passed to `--since`/`--before` in a generated command.

## Raw excerpts
```
L237 [RESULT] 039a9695440 2026-08-26 16:48:24 +0000
f5ac3e3c643 2026-08-26 16:48:20 +0000
4917982a2d4 2026-08-25 08:17:31 -0500
adf654542a9 2026-08-24 17:49:51 -0600
a408a8822c0 2026-08-24 19:04:46 -0400
1d961d5cc5e 2026-08-21 22:50:30 +0000
285d779b78a 2026-08-19 16:39:01 +0200
e7de47b6083 2026-08-18 10:25:04 +1000
f6e9cd0a580 2026-08-17 23:38:59 +0000
c883033bb6d 2026-08-18 09:37:11 +1000
L277 [TOOL Bash] git rev-parse --since=2026-08-17; date -r $(git rev-parse --since=2026-08-17 | sed 's/.*=//'); git log -1 --format='%ct %cd' af35f7f0af7
L278 [RESULT] --max-age=1787008096
Mon Aug 17 19:08:16 EDT 2026
1786995853 Mon Aug 17 13:44:13 2026 -0600
L282 ;; git reads a bare date as that day at the current time of day
  (or (some->> (git "rev-parse" (str "--since=" (cond-> date (re-matches #"\d{4}-\d{2}-\d{2}" date) (str " 00:00")))) ...
```
