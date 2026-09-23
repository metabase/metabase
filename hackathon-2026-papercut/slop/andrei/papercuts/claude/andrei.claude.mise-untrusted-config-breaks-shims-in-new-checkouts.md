---
title: `python3` resolves to a mise shim, so in a fresh worktree (or any checkout whose `mise.toml` was never trusted) every shimmed command, even a heredoc edit, fails with 'Config files ... are not trusted' until someone runs `mise trust`; subagents start in the parent's cwd and hit it in repos they are not working on
slug: mise-untrusted-config-breaks-shims-in-new-checkouts
kind: env-friction
impact: wasted-time
severity: medium
status: open
area: mise shims (`~/.local/share/mise/shims/python3` first on PATH), per-checkout `mise.toml`, `git worktree add`, subagent starting cwd
merged_from: mise-untrusted-config-breaks-shimmed-tools, mise-untrusted-config-in-new-checkout-breaks-shims, untrusted-mise-toml-breaks-shimmed-tools-in-checkout
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/7496be2b-9961-45b7-8797-6ed8b8fdfcc2.jsonl
    lines: 534-710
    date: 2026-09-11
    jev: {any_papercut: 0.81, env_toolchain: 0.85, stale_state: 0.25, verify_mismatch: 0.54, misleading_code: 0.43, hidden_coupling: 0.58, stale_docs: 0.39, tool_footgun: 0.72, flaky: 0.41, agent_bug: 0.91, wasted_effort: 0.31, user_correction: 0.09}
---
## Summary
Scripted `python3 - <<'PY'` edits failed three times in one session because the working directory's `mise.toml` was untrusted: in a fresh worktree, in the long-lived main checkout of the same repository, and in a subagent reviewing a different repository whose shell started in the parent's cwd. The edit did not run, and in one case the rest of the compound command still printed, so the output looked half-successful.

## Symptom
- L534-L535: a `python3 -` edit in a new worktree exits 1 with `mise ERROR Config files in ~/src/mb/wt/<worktree>/mise.toml are not trusted.`
- L704-L705: the same error for the main checkout's `mise.toml`; the grep later in the same command still printed its matches, the edit did not happen.
- Subagent agent-aaebb819c1f2fde01 L72-L73: a review script for another repository fails with the parent checkout's trust error; L76-L77 it `cd`s to the scratchpad to get a working `python3`.

## Timeline
- L534-L535: edit fails in the new worktree.
- L538-L539: `mise trust <worktree>/mise.toml`; L543-L544: edit re-run, ok.
- L599: a `cd` inside a compound command moves the session cwd into the main checkout.
- L704-L705: next edit fails there; L709-L710: trust, re-run, edit applied.
- Subagent agent-aaebb819c1f2fde01 L72-L77: same failure in a subagent working on a different repo; worked around by running from the scratchpad.
- Cost: 3 failed edits, 3 extra calls, and one command whose partial output could pass for success.

## Root cause
`which -a python3` lists `~/.local/share/mise/shims/python3` before Homebrew's. A mise shim resolves config for the current directory and refuses to run when that directory's `mise.toml` is untrusted, even for a tool the file does not pin. `git worktree add` creates paths mise has never seen, and nothing in the agents' worktree flow runs `mise trust`. The main checkout had apparently never been trusted; earlier work there went through `uv`, which is on PATH directly rather than via a shim. Subagents start in the parent session's current directory, not the repo named in their prompt.

## Why agents fall for it
The error names mise and a config file, not python, and it hits commands unrelated to the repo's toolchain (an inline edit script). Agents do not expect a subagent reviewing one repository to inherit another repository's cwd.

## Current state
Checked origin/master of metabase: it ships `mise.toml`; `bin/dev-install` runs `mise trust --all`, `dev/bot/workmux-template.yaml` and `workmux-template-pr-env.yaml` run `mise trust`, and `dev/docker/claude-code/Dockerfile` sets `MISE_YES=1`. A plain `git worktree add`, which is how agents here create worktrees, gets none of that. The local mise trusted-configs directory holds one entry per worktree, each trusted by hand.

## Suggested fix
- Set `trusted_config_paths` in the global mise config to the directory that holds all checkouts and worktrees.
- Or run `mise trust` in whatever creates worktrees.
- Document that `python3` may be a mise shim that fails in untrusted directories.

## Detection signal
`mise ERROR Config files in .*mise.toml are not trusted` in any tool result; a subagent's first failing command naming a repo other than the one in its prompt.

## Raw excerpts
```
L534 [CALL] python3 - <<'PY' | import re | ... (inline edit script)
L535 [RESULT (ERROR)] Exit code 1 | mise ERROR error parsing config file: ~/src/mb/wt/<worktree>/mise.toml | mise ERROR Config files in ~/src/mb/wt/<worktree>/mise.toml are not trusted. | Trust them with `mise trust`.
L538 [CALL] mise trust ~/src/mb/wt/<worktree>/mise.toml 2>&1 | tail -2; ... echo done
L539 [RESULT] mise trusted ~/src/mb/wt/<worktree> | ... | done
L704 [CALL] python3 - <<'PY' | ... (inline edit script)
L705 [RESULT] mise ERROR error parsing config file: <checkout>/mise.toml | mise ERROR Config files in <checkout>/mise.toml are not trusted. | ... | <grep hit printed by the command's last step>
L709 [CALL] mise trust <checkout>/mise.toml 2>&1 | tail -1 | python3 - <<'PY' ...
L710 [RESULT] mise trusted <checkout> | ...
L72 [CALL] (subagent aaebb) SP=<scratchpad> && cat > $SP/scan.py <<'PY' ... (then python3 $SP/scan.py)
L73 [RESULT] (subagent aaebb) mise ERROR error parsing config file: <checkout>/mise.toml | mise ERROR Config files in <checkout>/mise.toml are not trusted.
L76 [CALL] (subagent aaebb) SP=<scratchpad> && cd $SP && python3 - <<'PY' 2>&1 | tail -5 | print("ok") | PY | echo "=== try /usr/bin/python3 ==="; /usr/bin/python3 -c "import sys; print(sys.version)"
L77 [RESULT] (subagent aaebb) ok | === try /usr/bin/python3 === | 3.9.6 ...
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/ac37fe71-7046-48c1-885f-5bf5d9754c26.jsonl
  lines: 948-1064
  date: 2026-09-10
  jev: {any_papercut: 0.88, env_toolchain: 0.82, stale_state: 0.33, verify_mismatch: 0.77, misleading_code: 0.69, hidden_coupling: 0.73, stale_docs: 0.38, tool_footgun: 0.84, flaky: 0.25, agent_bug: 0.96, wasted_effort: 0.78, user_correction: 0.09}

- L956: mise parse and trust errors, followed by a grep hit from the tail of the same command.
- L965-L966: `grep -c` for the new symbol returns 0 for both edited files: the edit had not landed.
- L1049, L1053: `gh pr create` and `gh pr list` in that checkout print only `mise ERROR Version: 2026.9.1 ...` lines.
- L1057-L1064: the same gh commands from the parent directory work; the PR is created there.

- L948: branch switch plus Python heredoc edit in one chain.
- L956: mise errors; output from the chain's last command makes it look partly successful.
- L960-L966: agent verifies and finds no edit.
- L970-L971: edit redone with /usr/bin/python3.
- L1041-L1053: PR creation and listing from the checkout fail with only mise output.
- L1057-L1064: rerun from the parent directory succeeds.
- Cost: about 7 tool calls and a PR-create attempt whose outcome was unknown until checked from another directory.

```
L948 [CALL] Bash: cd <checkout> && git checkout -q main ... && git checkout -q -b <branch> origin/main && python3 - <<'PY' | ... (inline edit script)
L956 [RESULT] mise ERROR error parsing config file: <checkout>/mise.toml | mise ERROR Config files in <checkout>/mise.toml are not trusted. | Trust them with `mise trust`. ... | mise ERROR Version: 2026.9.1 macos-arm64 (2026-09-02) | ... | 23:<grep hit printed by the chain's last command>
L965 [CALL] Bash: cd <checkout> && /usr/bin/grep -c "<new symbol>" <file1> <file2>; git log --oneline -1; ls -la <file1>
L966 [RESULT] <file1>:0 | <file2>:0 | <sha> <commit subject> | ...
L970 [CALL] Bash: cd <checkout> && /usr/bin/python3 - <<'PY' | ...
L971 [RESULT] ok | <file1>:1 | <file2>:2
L1041 [CALL] Bash: cd <checkout> && gh pr create --repo <other-repo> --draft --base main --head <branch> --title "..." --body ...
L1049 [RESULT] mise ERROR Version: 2026.9.1 macos-arm64 (2026-09-02) | mise ERROR Run with --verbose or MISE_VERBOSE=1 for more information
L1052 [CALL] Bash: cd <checkout> && gh pr list --repo <other-repo> --head <branch> --json number,url,isDraft --jq '.[]' 2>&1 | tail -2
L1053 [RESULT] mise ERROR Version: 2026.9.1 macos-arm64 (2026-09-02) | mise ERROR Run with --verbose or MISE_VERBOSE=1 for more information
L1057 [CALL] Bash: cd <parent directory> && gh pr list --repo <other-repo> --head <branch> --json number,url,isDraft --jq '.[]'
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/31c858da-b01f-4914-87ef-7f7df04bd7c0/subagents/agent-a0128252768ece1b1.jsonl
  lines: 172-192
  date: 2026-09-14
  jev: {any_papercut: 0.75, env_toolchain: 0.83, stale_state: 0.23, verify_mismatch: 0.76, misleading_code: 0.23, hidden_coupling: 0.49, stale_docs: 0.22, tool_footgun: 0.69, flaky: 0.22, agent_bug: 0.70, wasted_effort: 0.52, user_correction: 0.08}

L187-L188: `mise ERROR error parsing config file: <scratchpad>/<clone>/mise.toml` and `Config files in <scratchpad>/<clone>/mise.toml are not trusted. Trust them with mise trust.`, then the unchanged conflict markers and `Found 13 errors.` L191-L192 the agent re-ran with a virtualenv interpreter and `MISE_TRUSTED_CONFIG_PATHS=$PWD`, adding `assert s2!=s` so a no-op edit would fail loudly.

- 15:24:44 L172 `git clone --no-checkout <checkout> <scratchpad>/<clone>`, then a merge that conflicts in one test file.
- 15:25:26 L187 `cd <scratchpad>/<clone> && python3 - <<'EOF' ...` plus a ruff check.
- L188 mise refuses; conflict markers remain; ruff reports 13 errors on the conflicted file.
- 15:25:38 L191-L192 retry with the virtualenv interpreter and a trust override; the merge resolves and ruff is clean.
- Other agents in the session pre-empt it: `export MISE_TRUSTED_CONFIG_PATHS=$S` (agent-a081e5c29fa5d1099 L293), `mise trust -q` (agent-a4cd3d422803f3408 L614).
- Cost: one retry; the 13 ruff errors were a misleading signal about the merge itself.

```
L172 [CALL] SP=<scratchpad> && rm -rf $SP/<clone> && git clone -q --no-checkout <checkout> $SP/<clone> && cd $SP/<clone> && git branch -r | head -20 && ...
L187 [CALL] cd <scratchpad>/<clone> && python3 - <<'EOF' (regex that resolves the conflict in one test file) EOF ...; /usr/bin/grep -c "<<<<<<<\|>>>>>>>" <test file>; PYTHONDONTWRITEBYTECODE=1 <venv>/bin/ruff check --no-cache <test file> 2>&1 | tail -3
L188 [RESULT] mise ERROR error parsing config file: <scratchpad>/<clone>/mise.toml mise ERROR Config files in <scratchpad>/<clone>/mise.toml are not trusted. Trust them with `mise trust`. ... <<<<<<< HEAD ... ======= ... >>>>>>> origin/<branch> ... 2    |  Found 13 errors.
L191 [CALL] cd <scratchpad> && PYTHONDONTWRITEBYTECODE=1 <venv>/bin/python - <<'EOF' ... assert s2!=s open(p,'w').write(s2) EOF ... cd <clone> && MISE_TRUSTED_CONFIG_PATHS=$PWD PYTHONDONTWRITEBYTECODE=1 <venv>/bin/ruff check --no-cache . 2>&1 | tail -3
L192 [RESULT] ... 0 All checks passed!
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/0e1872d9-87e2-408f-b68a-3bc4df20f4ea.jsonl
  lines: 272-371
  date: 2026-09-10
  jev: {any_papercut: 0.48, env_toolchain: 0.82, stale_state: 0.11, verify_mismatch: 0.18, misleading_code: 0.15, hidden_coupling: 0.42, stale_docs: 0.26, tool_footgun: 0.51, flaky: 0.35, agent_bug: 0.45, wasted_effort: 0.53, user_correction: 0.76}

L273: `mise ERROR error parsing config file: <checkout>/mise.toml` / `mise ERROR Config files in <checkout>/mise.toml are not trusted.` repeated for each PR.

- L272-L273: all 15 `gh pr view` calls fail inside the checkout.
- L280-L281: rerun from /tmp works ('Shell cwd was reset').
- L370-L371: the default-branch check fails the same way after another `cd` into the checkout.
- Cost: two failed multi-call loops.

```
L272 [CALL] Bash: cd <checkout> && for p in <15 PR numbers>; do printf "%s " $p; gh pr view $p --repo <other-repo> --json mergeable,mergeStateStatus,statusCheckRollup --jq ...
L273 [RESULT] <n> mise ERROR error parsing config file: <checkout>/mise.toml
    mise ERROR Config files in <checkout>/mise.toml are not trusted.
    Trust them with `mise trust`. See https://mise.jdx.dev/cli/trust.html for more information.
    mise ERROR Version: 2026.9.1 macos-arm64 (2026-09-02)
    mise ERROR Run with --verbose or MISE_VERBOSE=1 for more information
L280 [CALL] Bash: cd /tmp && for p in <15 PR numbers>; do printf "%-4s " $p; gh pr view $p --repo <other-repo> ...
L281 [RESULT] <n>  MERGEABLE/CLEAN checks=SUCCESS
    <n>  MERGEABLE/CLEAN checks=SUCCESS
    <n>  MERGEABLE/CLEAN checks=SUCCESS
```
