---
title: Drafted prose hedges, concedes, and uses stock phrases ("is the gate", "expect to", overly broad claims) even with the voice skill loaded; user corrects line by line
slug: prose-concessions-and-slop-despite-voice-skill
kind: agent-behaviour
impact: wasted-time
severity: low
status: documented-still-hit
area: sound-less-like-an-ai / precis skills; CLAUDE.md and skill prose; argument docs
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/cfa33e63-6d28-41e3-b4de-0fa2b9ca5cf1.jsonl
    lines: 417-1226
    date: 2026-08-27
    jev: {self_inflicted_bug: 0.69, tool_misuse: 0.38, misleading_signal: 0.64, user_correction: 0.92, codebase_trap: 0.81, flailing: 0.21, env_friction: 0.27}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/6da9d86f-a923-4553-b05f-b4e4e363b231.jsonl
    lines: 686-836, 1313-1354
    date: 2026-09-02
    jev: {self_inflicted_bug: 0.78, tool_misuse: 0.60, misleading_signal: 0.60, user_correction: 0.97, codebase_trap: 0.75, flailing: 0.32, env_friction: 0.72}
---
## Summary
Not an environment trap; a recurring pattern that drives the high user_correction scores. In cfa33e63 the agent loaded `sound-less-like-an-ai` (L715), then drafted a doc section that "opens by conceding" (L757, its own words) when the user wanted an argument; user: "there's a lot of concession etc there - i'm trying to make an argument, steel man my position" (L772), then "remove all concessions etc. this is not a diary" (L877), then "i don't quite understand the structure of this document - what are you trying to accomplish?" (L896). In 6da9d86f, editing skill/CLAUDE.md text about ratchets, the user corrected five times in a row: an overly broad claim ("every one of them is budgeted" — false, `:unlimited` exists, L746), a self-contradiction ("fix the underlying warning first, and expect to need approval for one", L774, L793), "is the gate - llm slop talk, speak naturally and clearly" (L809), and "i prefer not breaking lines when it's not necessary" (L1313).

## Symptom
Multiple consecutive user turns that quote a phrase and reject it.

## Root cause
Model defaults (balanced/hedged framing, stock nouns like "gate", preemptive concessions). The voice skill lists tells, but the drafts were not checked against them before sending. The skill file itself had rotted (bc4e47b6 L665 user: "i think the sound-less-like-an-ai and precis skills may have rotted a bit") and its training log was being written to a shadow copy (see `stow-symlink-replaced-by-mv-shadow-copy`).

## Why agents fall for it
"Balanced decision support" instructions from earlier turns carry over into a request for advocacy; the agent optimises for being "survivable" in a meeting instead of for the user's stated goal.

## Current state
Documented: memory `feedback_voice_skill.md`, `feedback_no_diary_comments.md`, `feedback_style_tight_docstrings.md` (updated in-session with "do not wrap unless needed"), `voice-samples.md`. Still hit.

## Suggested fix
Add these specific pairs to voice-samples.md ("is the gate" -> "CI checks this with ...", "expect to need approval" -> "needs approval", concession-first openings -> claim-first). A pre-send self-check against the skill's tells table for any text going into a doc/PR.

## Detection signal
User message quoting a phrase in double quotes followed by a style complaint ("slop", "verbose", "concession", "diary", "contradiction").

## Raw excerpts
```
6da9d86f L746 [USER] "every one of them is budgeted" - that's not true, some can be :unlimited. avoid making overly broad statements. say as little as necessary so you don't need to get into the weeds
L774 [USER] "fix the underlying warning first, and expect to need approval for one" - if you fix it, you won't need the ignore, or the approval. "expect to" is needlessly verbose and roundabout
L809 [USER] "is the gate" - llm slop talk, speak naturally and clearly
cfa33e63 L757 [ASSISTANT] ... **It opens by conceding.** "Where I agree" gives away burn-down ...
L772 [USER] there's a lot of concession etc there - i'm trying to make an argument, steel man my position.
L877 [USER] "It is not a debt tracker and I was wrong to argue it as one." - remove all concessions etc. this is not a diary.
```

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-kondo-ratchets-merge-script/a2d41fab-dd88-43ad-bebe-2e6c63b8a7d4.jsonl
  lines: 823-856
  date: 2026-08-30
  jev: {self_inflicted_bug: 0.89, tool_misuse: 0.17, misleading_signal: 0.24, user_correction: 0.92, codebase_trap: 0.68, flailing: 0.12, env_friction: 0.16}

The same tendency in code comments. The agent's #81319 cleanup added multi-line "why" comments at five sites (file-paths.yaml, the kondo_ratchet `check` try, the `fail!` docstring, the shrink workflow's auto-merge guard, the test `ci?` helper). The user said: "don't go overboard with verbose comments" (L825). The agent trimmed them to eight lines in total (L829-856). For example, the `ci?` comment went from "Compared against "true" rather than tested for presence: local tooling sets CI=false and CI=, both of which would otherwise read as CI and skip the tightening these tests rely on." to "Local tooling sets CI=false and CI=, and both are truthy when tested for presence." This is covered by memory (`feedback_style_tight_docstrings.md`, `feedback_no_diary_comments.md`, `feedback_plain_language_comments.md`), so it is documented and still hit.
