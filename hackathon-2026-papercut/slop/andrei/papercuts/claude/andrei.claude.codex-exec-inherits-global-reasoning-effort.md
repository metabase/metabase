---
title: Headless `codex exec` inherits the global ~/.codex config (ultra reasoning effort), so a one-file edit task ran for 10 minutes spawning sub-agents and was killed by the Bash tool timeout with no output
slug: codex-exec-inherits-global-reasoning-effort
kind: tool-quirk
impact: wasted-time
severity: medium
status: unknown # the global config sets the effort and changes over time; not checked today
area: codex exec (VS Code extension bundle, 0.151 alpha); ~/.codex/config.toml (model_reasoning_effort); Claude Code Bash 10-minute timeout
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/d5cca5e9-c6ad-4217-9099-ec7037544bc0.jsonl
    lines: 534-584
    date: 2026-09-02
    jev: {any_papercut: 0.86, env_toolchain: 0.88, stale_state: 0.40, verify_mismatch: 0.09, misleading_code: 0.21, hidden_coupling: 0.65, stale_docs: 0.48, tool_footgun: 0.89, flaky: 0.86, agent_bug: 0.90, wasted_effort: 0.84, user_correction: 0.88}
---
## Summary
The agent ran `codex exec --sandbox read-only -o out.md "<edit prompt>"` for a short doc. The user's global ~/.codex/config.toml set `model_reasoning_effort = "ultra"` and remote MCP servers, and the run lasted the Bash tool's full 10 minutes (exit 143) without writing the output file; its session log shows 54 reasoning items, 7 tool calls and inter-agent messages for a task that needed one read. Rerun with a throwaway CODEX_HOME holding only the auth file and `model_reasoning_effort = "medium"`, it finished in under three minutes.

## Symptom
L535: `Exit code 143 | Command timed out after 10m 0s | codex-cli 0.151.0-alpha.7.2`; L542: output file missing. L581-L584: the rerun with the trimmed config completed with `codex exit: 0` and the edits.

## Timeline
- L534 (16:59 UTC): first run with the global config, foreground, 10-minute cap.
- L535 (17:09): killed at the timeout, no output.
- L540-L542: agent guesses MCP servers or ultra reasoning; no codex log file where it looked.
- L543-L549 (17:09): rerun with CODEX_HOME containing auth plus `model_reasoning_effort = "medium"`, backgrounded.
- L581-L584 (17:12): completes.
- Cost: 10 minutes of wall time and Codex usage quota.

## Root cause
`codex exec` reads the same ~/.codex/config.toml as interactive use, where the user had set the highest reasoning effort and configured MCP servers. At that effort the model fanned out into sub-agent work for a simple edit and exceeded the caller's 10-minute limit. Whether the MCP servers also contributed is unknown; the rerun changed both at once.

## Why agents fall for it
The headless invocation takes no effort flag by default, the config file is outside the agent's view, and the 10-minute Bash cap is shorter than an ultra-effort run.

## Current state
Not checked.

## Suggested fix
- In the documented headless command, pass the effort explicitly (a `-c model_reasoning_effort=medium` override or a dedicated CODEX_HOME/profile for agent use).
- Run codex exec in the background with its own timeout and check the output file, rather than in a foreground call capped at 10 minutes.

## Detection signal
`codex exec` calls ending in `Command timed out after 10m` or exit 143; CODEX_HOME overrides appearing right after a timeout.

## Raw excerpts
```
L534 [CALL] Bash: CODEX=~/.vscode/extensions/openai.chatgpt-26.825.51511-darwin-arm64/bin/macos-aarch64/codex && $CODEX --version 2>&1 | head -1 && OUT=<scratchpad>/codex-pass.md && $CODEX exec --skip-git-repo-check --sandbox read-only -C <dir> -o "$OUT" "<edit prompt>" 2>&1 | tail -5; ...
L535 [RESULT (ERROR)] Exit code 143 | Command timed out after 10m 0s | codex-cli 0.151.0-alpha.7.2
L542 [RESULT] (eval):1: no such file or directory: <scratchpad>/codex-pass.md | out file: missing bytes | --- newest session/log --- | 2026 | (eval):1: no matches found: ~/.codex/log/*.log | ...
L543 [CALL] Bash: SCR=<scratchpad>; H=$SCR/codex-home; mkdir -p "$H" && cp ~/.codex/auth.json "$H/" && printf 'model = "gpt-5.6-sol"\nmodel_reasoning_effort = "medium"\n' > "$H/config.toml" && CODEX=... && CODEX_HOME="$H" $CODEX exec --skip-git-repo-check --sandbox read-only -C <dir> -o "$SCR/codex-pass.md" "<edit prompt>" > "$SCR/codex-run.log" 2>&1; echo "codex exit: $?" >> "$SCR/codex-run.log"
L584 [RESULT] codex exit: 0 | === codex-pass.md === | 1. Line 3 | Original: ...
```
