---
title: `roborev close` takes exactly one job id and 404s on canceled jobs; bulk-closing superseded reviews silently did nothing, then half-failed
slug: roborev-close-single-id-and-canceled-jobs
kind: tool-quirk
impact: wasted-time
severity: low
status: unknown
area: roborev CLI (close/address, comment, list --open)
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-pr-03-llm-config/93bd1b32-5bde-4582-9d8a-53740b3387ef.jsonl
    lines: 3438-3472
    date: 2026-08-30
    jev: {self_inflicted_bug: 0.87, tool_misuse: 0.96, misleading_signal: 0.92, user_correction: 0.35, codebase_trap: 0.80, flailing: 0.47, env_friction: 0.85}
---
## Summary
The user asked to clean up 36 open roborev reviews on four branches. There were three failed passes:
1. A loop with `>/dev/null 2>&1` on each `roborev comment`/`roborev close`. Everything was swallowed and nothing closed.
2. `roborev close $IDS` with a newline-joined variable. zsh passed one argument, and roborev replied
   `Error: invalid job_id: 4606\n4607\n...` (printed as `NOT CLOSED ...`).
3. A read loop worked for `done` jobs, but every `canceled` job failed with
   `failed to mark review: {"title":"Not Found","status":404,"detail":"review not found for job"}`.
11 canceled jobs stay "open" forever in `roborev list --open`.

## Symptom
```
L3445 closing: 30 jobs / failed: 4606\n4607\n...   (list unchanged)
L3450 roborev close --help -> Usage: roborev close <job_id> [flags]   (single id)
L3455 NOT CLOSED 4606 ... 5154: Error: invalid job_id: 4606\n4607...
L3467 FAILED 4606: Error: failed to mark review: {... "status":404,"detail":"review not found for job"}
L3470 pr/01-foundation 4662 canceled - ... (still listed as open)
```

## Timeline
L3439-3445 first attempt; L3448-3453 checks help, one manual close works; L3454-3455 second attempt (zsh
splitting); L3465-3467 read loop; L3469-3472 11 canceled jobs remain; the agent leaves them.

## Root cause
The CLI accepts a single positional id and gives no bulk form. `list --open` includes canceled jobs that have no
review row, so they can never be closed. Combined with zsh non-splitting (see `zsh-and-bsd-shell-quirks`) and
blanket redirects, the failures were invisible.

## Why agents fall for it
Most CLIs of this kind accept multiple ids. `--open` suggests every listed job is closeable.

## Current state
Not re-verified (roborev is a host daemon). The kata skill documents the roborev/kata integration but not close
semantics.

## Suggested fix
roborev: accept multiple ids; let `close` on a canceled job mark it closed (or exclude canceled jobs from
`--open`); return a nonzero exit per failure with the id in the message.

## Detection signal
`roborev close` invoked inside a loop with `2>&1 >/dev/null`, or with an unquoted multi-line variable; `404 review not found for job`.

## Raw excerpts
See Symptom.
