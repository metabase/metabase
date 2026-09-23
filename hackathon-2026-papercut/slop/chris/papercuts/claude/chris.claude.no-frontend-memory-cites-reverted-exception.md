---
title: The no-frontend memory's "relaxed" clause uses the #80394 dialog-copy edit as its example, but the user rolled that exact edit back the same day, so the memory now points agents the wrong way
slug: no-frontend-memory-cites-reverted-exception
kind: doc-gap
impact: wasted-time
severity: low
status: open
area: ~/.claude/projects/-Users-christruter-workspace-metabase-metabase/memory/feedback_no_frontend.md; ai-controls EnableAdvancedModal.tsx / DisableAdvancedModal.tsx
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-80394-metabot-tennant/b31b1fd7-7c96-47c9-95ad-9bfbd57f1c09.jsonl (deleted; reconstructed from redacted chunks)
    lines: 317-342, 415-418
    date: 2026-08-21
    jev: {self_inflicted_bug: 0.75, tool_misuse: 0.89, misleading_signal: 0.68, user_correction: 0.82, codebase_trap: 0.68, flailing: 0.46, env_friction: 0.85}
---
## Summary
An earlier session on branch `80394-metabot-tennant` committed `fd60641` "Backfill the tenant permission cleanup and make both mode-switch dialogs tenant-aware". The FE copy edit was sanctioned by a memory update. `feedback_no_frontend.md` now reads: "**Relaxed (2026-08-21):** for a minor FE edit that belongs with a backend fix — e.g. a dialog copy string that names the wrong group (issue #80394) — go ahead and make it, and request FE-engineer review on the PR rather than leaving it out."

Later that day (this session) the /code-review flagged the duplicated FE strings (finding 9). The agent said "FE (finding 9) left alone per your no-frontend rule" (L317), which contradicts the memory's relaxation. The user then said (L325) "maybe we should totally avoid touching fe copy, rollback what we did". The agent reverted both modals to master (`269f244`, "Leave the mode-switch dialog copy as it was"). Roborev 4789 then complained that the revert "removes tenant-specific wording". At L415 the user said "ignore FE directive, make a judgement call", and the agent again chose to leave the FE copy alone.

The memory was not updated afterwards. It still cites the #80394 dialog copy as the example of an allowed FE edit, even though the user reversed exactly that edit.

## Symptom
Three direction changes on the same two TSX files in one day (edit → revert → "judgement call"), plus a roborev finding against the revert. The next agent that reads the memory will be told to make the edit that the user rolled back.

## Timeline
- (earlier session) `fd60641` makes both dialogs tenant-aware. Memory relaxed with #80394 as the example.
- b31 L317: "**FE (finding 9)** left alone per your no-frontend rule".
- b31 L325 USER: "maybe we should totally avoid touching fe copy, rollback what we did"
- b31 L330: `git checkout origin/master -- .../EnableAdvancedModal.tsx .../DisableAdvancedModal.tsx`, commit "Leave the mode-switch dialog copy as it was".
- b31 L359: roborev 4789 on 269f244: "Restore tenant-aware copy based on `use-tenants`".
- b31 L415 USER: "what do you think, worth fixing now? ignore FE directive, make a judgement call"
- b31 L418: "Dialog copy — no. ... needs new translatable strings plus FE review. Putting that into a triple-backport PR adds string churn and conflict risk on three release branches".

## Root cause
The memory recorded a one-off permission as a general rule, anchored on a specific issue. Nobody updated it when the decision flipped.

## Why agents fall for it
The memory is the only place the FE policy lives, and a concrete example reads as a precedent.

## Current state
Still open: `feedback_no_frontend.md` still contains the "Relaxed (2026-08-21) ... (issue #80394)" paragraph. The PR merged without FE changes (master's `api/permissions.clj` has no FE counterpart change; the PR body says "The fix has no schema migration or frontend changes").

## Suggested fix
Edit the memory. Drop #80394 as the example, or add: "Exception: backport PRs. String changes add translation churn on release branches; leave copy to an FE follow-up." Or state the actual rule: "ask before any FE edit".

## Detection signal
A user message that reverses a memory-backed decision ("rollback what we did", "ignore X directive") should prompt a memory review. Memory entries that name a specific issue as the example of an exception deserve a periodic staleness check.

## Raw excerpts
```
b31 L317 [ASSISTANT] ... 3. **FE (finding 9)** left alone per your no-frontend rule; the modal copy is still accurate in effect. Worth a note to the FE reviewer about the duplicated strings.
b31 L325 [USER] maybe we should totally avoid touching fe copy, rollback what we did
b31 L342 [ASSISTANT] Committed as `269f24465d2` — both modals are back to their master versions, so the branch no longer touches any frontend code.
b31 L415 [USER] what do you think, worth fixing now? ignore FE directive, make a judgement call
```
