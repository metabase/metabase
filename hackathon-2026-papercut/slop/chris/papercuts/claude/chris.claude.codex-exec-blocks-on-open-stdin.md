---
title: Backgrounded `codex exec "<prompt>"` with stdin left open hangs forever on "Reading additional input from stdin..."
slug: codex-exec-blocks-on-open-stdin
kind: tool-quirk
impact: wasted-time
severity: high
status: documented-still-hit
area: codex CLI (`codex exec`) invoked from Claude Code background Bash; memory reference_codex_cli_second_opinion.md
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/bc4e47b6-6b1e-4a41-84b4-440e15655cc0.jsonl
    lines: 725-1103
    date: 2026-09-22
    jev: {self_inflicted_bug: 0.93, tool_misuse: 0.94, misleading_signal: 0.74, user_correction: 0.52, codebase_trap: 0.53, flailing: 0.71, env_friction: 0.97}
---
## Summary
The agent launched `codex exec --full-auto -m gpt-5.6-sol -c model_reasoning_effort=high -C /Users/christruter "$(cat $SP/codex-brief.md)" > $SP/codex-out.txt 2>&1` as a background task. Even with the prompt passed as an argument, codex (0.15x) also reads stdin when it is not a TTY and not closed; in a Claude Code background task stdin stays open, so codex printed `Reading additional input from stdin...` and waited. The agent kept polling "codex: still running" for ~59 minutes, parking other work ("holding the directory fold until codex releases those paths") on a process that was doing nothing (CPU 0:00.11).

## Symptom
```
L1072 codex: STILL RUNNING / output bytes: 39
L1086 od -c codex-out.txt -> "Reading additional input from stdin...\n"
      23678       58:46 S      0:00.11 codex exec --sandbox read-only -m gpt-5.6-sol ...
L1089 [ASSISTANT] Found it — codex has been blocked for 59 minutes, not working ... With stdin left open in a background task, `codex exec` waits on it forever. It needed `</dev/null`. My mistake — that's an hour lost.
L1098 codex exec ... "$(cat $SP/codex-brief-ro.md)" < /dev/null > $SP/codex-out.txt 2>&1
```
Earlier checks at L751, L827, L878 all reported "codex still running" and treated it as healthy ("nothing on stdout yet, which is expected since it emits everything in a final message").

## Root cause
codex exec reads additional prompt input from stdin whenever stdin is not a TTY, even when a prompt argument is given. Background tool processes inherit an open, never-closed stdin.

## Why agents fall for it
The recipe in memory (`reference_codex_cli_second_opinion.md`) is `codex exec -m ... "$(cat prompt.txt)"` with no `< /dev/null`. The "emits everything at the end" belief makes a silent process look normal. In another session (6da9d86f L1209) the heredoc form `codex exec ... <<'EOF'` worked because stdin was the heredoc.

## Current state
Memory recipe still lacks `</dev/null` (checked: `reference_codex_cli_second_opinion.md` shows `codex exec -m gpt-5.6-sol -c model_reasoning_effort="high" -s read-only --skip-git-repo-check "$(cat prompt.txt)"`). Also the memory file says `-s read-only`; the session used `--full-auto` with `-C /Users/christruter` for write access.

## Suggested fix
- Add `< /dev/null` to the memory recipe and a line: "a codex exec with 39 bytes of output and ~0 CPU after a minute is blocked on stdin, not thinking".
- Prefer the heredoc form (prompt on stdin) or `-o FILE`.

## Detection signal
`codex exec` in a background Bash without `<` redirection; output file containing only `Reading additional input from stdin...`; repeated polling of a process with near-zero CPU time.

## Raw excerpts
```
L1076 ps: 23675   58:38 Ss     0:00.01 /bin/zsh -c source /Users/christruter/.claude/shell-snapshots/snapshot-zsh-...
L1086 0000000    R   e   a   d   i   n   g       a   d   d   i   t   i   o   n
      0000020    a   l       i   n   p   u   t       f   r   o   m       s   t
```
