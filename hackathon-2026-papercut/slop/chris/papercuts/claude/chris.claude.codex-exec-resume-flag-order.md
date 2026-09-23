---
title: "`codex exec resume` rejects flags placed after `resume`, and piping codex output through `tail` drops its worst-first top finding"
slug: codex-exec-resume-flag-order
kind: tool-quirk
impact: wasted-time
severity: low
status: documented
area: codex CLI 0.153.x (`codex exec`, `codex exec resume`), second-opinion workflow
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-nested-modules-infrastructure-master/89a35c24-7164-4f4d-a95a-33b5cdfde927.jsonl
    lines: 1501-1564, 1678-1692
    date: 2026-09-08 (memory written the same day; session continued to 2026-09-20)
    jev: {self_inflicted_bug: 0.64, tool_misuse: 0.95, misleading_signal: 0.81, user_correction: 0.66, codebase_trap: 0.63, flailing: 0.33, env_friction: 0.93}
---
## Summary
The user asked for a Codex second opinion on the agent's prose. The agent ran `codex exec ... | tail -40`.
Codex ranks findings worst-first, so the `tail` cut off finding #1. To recover it, the agent tried
`codex exec resume --last -s read-only --skip-git-repo-check "Reprint finding #1 only"`, and codex
rejected it: `error: unexpected argument '-s' found`. Flags for `exec` must come *before* the `resume`
subcommand (`codex exec --skip-git-repo-check resume --last "..."`). Resume also falls back to the
config default model (`gpt-5.6-terra`) unless `-m` is given again. The output shows `model: gpt-5.6-terra`
after the resume.

## Symptom
```
L1545 [TOOL Bash] timeout 900 codex exec resume --last -s read-only --skip-git-repo-check "Reprint finding #1 only — verbatim, same format. Nothing else." 2>&1 | tail -40
L1546 [RESULT] error: unexpected argument '-s' found
  tip: to pass '-s' as a value, use '-- -s'
Usage: codex exec resume [OPTIONS] [SESSION_ID] [PROMPT]
L1554 [TOOL Bash] timeout 900 codex exec --skip-git-repo-check resume --last "Reprint finding #1 only, verbatim, in the same format. Nothing else." 2>&1 | tail -40
L1555 [RESULT] ... model: gpt-5.6-terra ... sandbox: read-only ...
```

## Timeline
- L1502-1519 agent explores `codex --help`, `codex exec --help` and `~/.codex/config.toml` (default model `gpt-5.6-terra`, effort `medium`; there is no model list command).
- (before L1543) first run piped through `tail`, which lost the top finding.
- L1545-1555 resume attempts, described above.
- L1687-1692 agent writes the memory `reference_codex_cli_second_opinion.md` and adds a MEMORY.md index line: "flags go before `resume`; don't `tail` the output".

## Root cause
clap subcommand parsing: options belong to the level where they are declared, so `exec`'s `-s` is not
accepted after `resume`. The tail truncation is caused by the agent's habit of `| tail -N` meeting codex's
worst-first output order.

## Why agents fall for it
`| tail -40` is a reflex for long tool output. Most CLIs accept flags anywhere.

## Current state
Documented in memory `reference_codex_cli_second_opinion.md` and in the MEMORY.md index ("codex CLI second
opinion — `codex exec -m gpt-5.6-sol`; flags before `resume`"). Related, separate trap: `codex exec`
waits on open stdin when run in the background (`codex-exec-blocks-on-open-stdin`).

## Suggested fix
Wrap it in `~/bin/codex-second-opinion` (fixed flags, `-o FILE`, `</dev/null`, model pinned on resume).

## Detection signal
`codex exec ... | tail`; `unexpected argument` from `codex exec resume`.

## Raw excerpts
See Symptom.
