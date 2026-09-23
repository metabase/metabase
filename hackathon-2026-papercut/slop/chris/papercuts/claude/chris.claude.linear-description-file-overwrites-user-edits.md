---
title: `linear issue update --description-file` replaces the whole description, overwriting the user's edits made since the agent last wrote it
slug: linear-description-file-overwrites-user-edits
kind: agent-behaviour
impact: introduced-bug
severity: medium
status: open
area: linear CLI (v2.5.0), Linear issue descriptions; analogous to gh pr edit --body
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-data-stack/71a7be8c-d0b2-498f-be23-d4ed3c031ddf.jsonl
    lines: 1091-1267
    date: 2026-09-03
    jev: {self_inflicted_bug: 0.76, tool_misuse: 0.95, misleading_signal: 0.68, user_correction: 0.98, codebase_trap: 0.58, flailing: 0.69, env_friction: 0.88}
---
## Summary
The agent created Linear issue BOT-2116 from a scratch file (`newissue.md`) at 15:06. The user then edited ("de-slopped") the description in Linear. 18 minutes later, after the user challenged a claim, the agent rewrote its local scratch file and ran `linear issue update BOT-2116 --description-file .../newissue.md --title ...`, a wholesale replace built from its own stale copy. The user: "why did you overwrite my text in the issue". The agent then spent ~10 tool calls trying to recover the text via GraphQL `history`, a non-existent `documentContentHistory` field, and decoding the Yjs `descriptionState` CRDT, and could not find the user's version.

## Symptom
L1209 [USER] "why did you overwrite my text in the issue".

## Timeline
- L1107-1111: Write `scratchpad/newissue.md`; `linear issue create --team BOT --title ... --description-file .../newissue.md --state Triage ...` -> BOT-2116.
- L1150: user corrects the premise of the issue (already-processed partitions are only listed, not loaded).
- L1179: agent rewrites `newissue.md` from its own earlier version.
- L1182: `linear issue update BOT-2116 --description-file .../newissue.md --title "Assess whether chunking the evals load is worth dropping from the heavy tier"` -> "✓ Updated issue".
- L1209: user complaint.
- L1221: "You did de-slop it and I overwrote it — a wholesale `--description-file` replace was the wrong tool."
- L1222-1246: `linear api` queries for `history { updatedDescription actor }` (actor is "chris" for both, since the CLI authenticates as the user), `documentContentHistory` (GraphQL validation error), `descriptionState` (Yjs blob). A complex `cd scratchpad && linear api ... | python3 -c` was refused by the worktree-isolation guard (L1243), forcing a split into separate commands.
- L1267: "I can't find it, and I don't want to invent a 'restoration.' ... Linear's web UI keeps a description version history that the API doesn't expose here".

## Root cause
- Agent habit: edit a local copy and push it back as the full body, with no read-before-write.
- Tool: the CLI's `--description-file` is replace-only; there is no optimistic-concurrency check (no "expected previous version" flag), and history via API attributes all writes to the same user, so recovery is hard.
- Nothing in memory warns about this for Linear. The metabase memory has the GitHub analogue (`feedback_reread_pr_desc_before_edit.md` — "Chris edits concurrently"), but it lives in the metabase project memory, not the data-stack one, and is phrased for `gh pr edit`.

## Why agents fall for it
The agent authored the description, so it feels like "its" text; the local scratch file looks authoritative; the CLI reports success.

## Current state
Open. `linear` CLI 2.5.0 still has only replace semantics. data-stack project memory (`~/.claude/projects/-Users-christruter-workspace-metabase-data-stack/memory/`) has no note about re-reading Linear descriptions before editing. Global `~/.claude/CLAUDE.md` has no such rule either.

## Suggested fix
- Global CLAUDE.md or a user-level memory: "Before replacing any shared text the user can edit (PR body, Linear description, doc), re-read the live version, diff it against your last-written copy, and merge; prefer a comment for new context."
- A wrapper (`~/bin/linear-safe-update`) that fetches the current description, refuses if it differs from a cached last-written hash, and shows the diff.
- Add to the `linear-cli` skill: "`--description-file` replaces the whole description; read it first."

## Detection signal
- `linear issue update ... --description-file` (or `gh pr edit --body-file`) in a session without a preceding `linear issue view <same id>` since the last write.
- User message containing "overwrite"/"overwrote my".

## Raw excerpts
```
L1267 [ASSISTANT] I can't find it, and I don't want to invent a "restoration."

**What the record shows.** The Yjs `descriptionState` CRDT retains deleted content, and I decoded the whole thing — every fragment in it is from one of my two versions (the original create, and my rewrite). There's no third voice in there. The history backs that up: after creation at 15:06:25, there is exactly one description write, at 15:24:27, plus a 15:25:08 entry with `updatedDescription: null` — consistent with my single `--description-file` call setting description then title. Both are attributed to "chris" because the CLI authenticates as you, so actor doesn't separate us.
...
**The mechanism was wrong regardless of whether text was lost.** I used a wholesale `--description-file` replace on an issue that had been sitting for 18 minutes, with no read-before-write and no diff. That's the same class of mistake as a force-push.
```
