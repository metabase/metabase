---
title: GitHub's collaborator-permission API returns `read` for any account on a public repo; two team.json audits built on it passed departed members, and a memory note told agents to use it as a membership check
slug: gh-collaborator-permission-read-means-nothing
kind: misleading-signal
impact: both
severity: medium
status: open  # partly fixed: memory note corrected 2026-09-17; .github/team.json:22,58,61,106,107 and release/github-slack-map.json:18,98,122 still list people who left (checked 2026-09-23)
merged_from: [team-json-stale-and-permission-read-misleads]
area: gh api repos/metabase/metabase/collaborators/<user>/permission; .github/team.json; GitHub org teams (metabot, core-backend-metabot); release/github-slack-map.json; memory reference_team_json_stale_members.md
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-slackbot-uploads-cleanup/8473e9da-ff98-4981-b139-b07f3e083eb0.jsonl
    lines: 1052-1441
    date: 2026-09-17
    jev: {self_inflicted_bug: 0.56, tool_misuse: 0.88, misleading_signal: 0.81, user_correction: 0.78, codebase_trap: 0.85, flailing: 0.41, env_friction: 0.60}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-pr-03-llm-config/93bd1b32-5bde-4582-9d8a-53740b3387ef.jsonl
    lines: 3947-4052, 4180-4211
    date: 2026-08-30
    jev: {self_inflicted_bug: 0.65, tool_misuse: 0.95, misleading_signal: 0.83, user_correction: 0.94, codebase_trap: 0.73, flailing: 0.47, env_friction: 0.54}
---
## Summary
`metabase/metabase` is public, so `gh api repos/metabase/metabase/collaborators/<user>/permission` returns `read` for any existing GitHub account (checked with `torvalds`). A non-collaborator is indistinguishable from a real read-only collaborator. Two agent audits of `.github/team.json` treated that as a membership check:

- **2026-08-30 (93bd1b32).** The user asked for "metabot" as reviewer. CODEOWNERS only has `@metabase/metabot-frontend`, so the agent read `team.json`, checked each Metabot member (all `write`), then ran a 59-member audit that printed STALE only when the permission call returned *empty*. It reported "Zero stale entries" and rewrote the memory note `reference_team_json_stale_members.md` to say the file had been cleaned up ("all 59 members ... resolve to current collaborators"). The user then said "appleby left the metabot team", later "svozniuk is the engineering manager", and (implied at L4050) tsplude was leaving too. The GitHub team `core-backend-metabot` still listed appleby, so requesting the team notified someone who had left. Going out of draft also auto-requested `cloud-ops` through a CODEOWNERS entry on `prometheus.clj`, which the agent didn't expect. Two PRs ended up with no reviewer at all.
- **2026-09-17 (8473e9da).** The memory note from the first audit now told agents: "before requesting reviewers, confirm each name with `gh api repos/metabase/metabase/collaborators/<user>/permission` ... To audit the whole file, loop that over every `members` entry", and "Do not assume it is stale; check before proposing a fix for it", which actively discouraged cleanup. Three people who had left (`bgrabow`, `qnkhuat`, `wotbrew`) came back `read`. The agent ran a control with `torvalds`, found the trap, and rewrote the memory.

## Symptom
During an audit of `.github/team.json` against GitHub teams (8473e9da, user request L1133), the loop printed `bgrabow: read`, `qnkhuat: read`, `wotbrew: read` (L1150). The agent probed with a random user (404) and `torvalds` (`read`) (L1160-1161) and concluded (L1166): "`read` actually indicates no access at all, since even an unrelated account like `torvalds` returns that value."

Earlier (93bd1b32):
```
L3976 59 / === checking every member ... === / === done ===        (loop printed STALE only if perm == "")
L3979 [ASSISTANT] Zero stale entries — all 59 members across every team are current collaborators. ... My memory note saying otherwise is out of date; let me fix that
L3992 [USER] appleby left the metabot team
L3995 [ASSISTANT] ... I tested "is a repo collaborator", which only proves the request won't be silently dropped. It says nothing about current team membership.
L4019 [USER] svozniuk is the engineering manager
L4195 #79978 teams: cloud-ops,core-backend-metabot ; #79979 teams: (none) ; #79980 teams: cloud-ops ; #79981 teams: (none)
```

## Timeline
Session 93bd1b32 (pr-03-llm-config, 2026-08-30):
- L3950-3958: no backend Metabot handle in CODEOWNERS; reads team.json.
- L3963-3964: 9 Metabot members all `write`.
- L3968-3976: whole-file audit; the STALE condition is `[ -z "$perm" ]`.
- L3979-3986: overwrites the memory note and MEMORY.md index line to "currently clean".
- L3992-4016: user correction; GitHub `core-backend-metabot` still has appleby; `svozniuk` in `metabot` but not in team.json.
- L4019-4027: EM deliberately absent; drops that item.
- L4051: files kata `v3bc` for the team update (deferred until tsplude leaves).
- L4183-4211: requests `metabase/core-backend-metabot`; `cloud-ops` shows up via CODEOWNERS.

Session 8473e9da (slackbot-uploads-cleanup, 2026-09-17):
- L1058 [USER] "add arkadi, anton, and oreon as explicit reviewrs". Agent can't find them in team.json (L1061-1080), resolves handles from `git log --author` + commits API (L1083-1092), confirms `admin` via permission API, requests review (L1107).
- L1113 [USER] "are there stale entries for them in team.json?" -> none.
- L1133 [USER] "we should probably audit team.json against all the team definitions in github".
- L1149: agent `cat`s the memory note (quoted in Raw excerpts), runs the permission loop.
- L1160-1166: control experiment with `torvalds`.
- L1172-1187: rewrites the memory note: "**`read` is not access.** ... The 2026-08-30 audit, which reported every member as a current collaborator, treated `read` as a pass and is not trustworthy."
- L1192 [USER] "those 3 people have all left".
- Later: CODEOWNERS references broken team slugs (`gh api repos/.../codeowners/errors` L1380: `Unknown owner — src/metabase/lib @metabase/core-backend-querying-platform`), and `release/github-slack-map.json` also still lists the leavers; filed as a BEGUILD RFC doc.

## Root cause
- GitHub API semantics: for public repos, "permission" reflects effective access including public read. A non-collaborator gets `read`, which looks like a successful lookup, so an existence or empty-string check passes.
- There's no machine-readable source of truth for "who is currently on team X and reviews backend". team.json has only `name/label/members`, GitHub teams drift, and departures live in people's heads.
- The memory note was written as a point-in-time audit claim instead of a durable procedure, the agent "fixed" it from a flawed check, and the next session trusted it.

## Why agents fall for it
The endpoint name ("collaborators/<user>/permission") and a non-error response look like a membership check. Empty-string checks are the natural shell idiom. The agent had an explicit memory saying "check before requesting" and ran a check; it was just the wrong one. In the second session the memory told it to trust that check.

## Current state
Verified against the checkout at `bf3d250f132` on 2026-09-23:
- Memory fixed: `~/.claude/projects/-Users-christruter-workspace-metabase-metabase/memory/reference_team_json_stale_members.md:17` now says "**`read` is not access.**" and "Only `write`/`maintain`/`admin` means a collaborator whose review counts", and adds that `repos/metabase/metabase/teams` 404s for our token. MEMORY.md index line: "Verify team.json reviewers — permission `read` = no access (public repo); 2026-09-17 drift audit".
- Data drift still open: `.github/team.json:22` `"bgrabow"`, `:106` `"wotbrew"`, `:107` `"qnkhuat"`; the Metabot entry still lists `appleby` (`:58`), `tsplude` (`:61`) and `krever` (`:67`). `release/github-slack-map.json:18,98,122` still map bgrabow/qnkhuat/wotbrew. The cleanup was parked by the user pending Slack/Notion reconciliation (RFC in Linear BEGUILD); kata `metabase#v3bc` tracks the Metabot team update.
- Status: the keeper said `fixed` (memory note), the duplicate said `open` (team data). The code/data check above shows the stale entries remain, so the merged status is `open`, partly fixed.
- Also noted in-session: `gh pr edit --add-reviewer` silently drops invalid names on a batch call (already in the memory note).

## Suggested fix
- Check `write` or above, or `gh api orgs/metabase/members/<user>` (204 vs 404) for org membership.
- A CI check or `mage team-audit` that diffs team.json against `gh api orgs/metabase/teams/<slug>/members`, flags anyone whose repo permission is below `write`, and checks every CODEOWNERS owner resolves (`codeowners/errors` endpoint returns non-empty today).
- Add `:inactive`/`:managers` fields to team.json so an EM is excluded on purpose, not by omission.
- In the pr-review/pr-writing skills: "Ask the user who should review. Don't infer from team.json."

## Detection signal
- Scripts treating any non-404 from `/collaborators/<u>/permission` as membership, or testing it with an empty-string or exit-code check; a `read` result for a supposed engineer.
- Memory notes asserting "audit clean" without saying what counted as a pass; an agent editing a memory file to *weaken* a warning right after an automated audit.

## Raw excerpts
Memory note before the fix (8473e9da L1150):
```
Re-audited 2026-08-30: **all 59 members across every team resolve to current collaborators** — the
file has since been cleaned up. Do not assume it is stale; check before proposing a fix for it.
...
**How to apply:** before requesting reviewers, confirm each name with
`gh api repos/metabase/metabase/collaborators/<user>/permission`, or read back `requested_reviewers`
after the call. To audit the whole file, loop that over every `members` entry.
bgrabow: read
qnkhuat: read
wotbrew: read
```
```
L1160 [TOOL Bash] ... gh api repos/metabase/metabase/collaborators/some-random-user-zz9/permission --jq .permission ...; gh api repos/metabase/metabase/collaborators/torvalds/permission --jq .permission
L1161 [RESULT] ... "some-random-user-zz9 is not a user" (HTTP 404) ... read
L1166 [THINKING] Almost there — I realized `read` actually indicates no access at all, since even an unrelated account like `torvalds` returns that value.
```
The 2026-08-30 audit loop (93bd1b32):
```
L3968 while IFS=$'\t' read -r team user; do
  perm=$(gh api "repos/metabase/metabase/collaborators/$user/permission" --jq '.permission' 2>/dev/null)
  [ -z "$perm" ] && printf "  STALE  %-22s %s\n" "$team" "$user"
done < /tmp/members.txt
L4009 === core-backend-metabot === andreis appleby crisptrutski lbrdnk prascuna retro tsplude
```
