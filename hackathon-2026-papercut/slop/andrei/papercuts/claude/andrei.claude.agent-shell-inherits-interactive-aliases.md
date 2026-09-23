---
title: In the agent shell `sed` is an alias for GNU `gsed`, so the macOS habit `sed -i '' 's/a/b/' file` takes `''` as the script and the substitution as a file name: the file is left unchanged (silently when stderr is discarded), and with `-e` the edit applies but the command still exits 2.
slug: agent-shell-inherits-interactive-aliases
kind: env-friction
impact: wasted-time
severity: medium
status: open # the shell rc files still alias sed to gsed
area: user shell rc files (`alias sed=gsed`), Bash tool shell snapshot, in-place edits with sed -i
merged_from: sed-alias-gsed-rejects-bsd-inplace-flag, sed-aliased-to-gnu-sed-breaks-bsd-inplace, sed-aliased-to-gsed-breaks-bsd-inplace-edit, sed-aliased-to-gsed-breaks-bsd-inplace-edits, sed-is-aliased-to-gnu-sed-in-agent-shell
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/c9770215-12da-4ae0-b3b7-9a6c0317621d/subagents/agent-a2d56f4019e02be3a.jsonl
    lines: 403-517
    date: 2026-09-18
    jev: {any_papercut: 0.77, env_toolchain: 0.82, stale_state: 0.25, verify_mismatch: 0.77, misleading_code: 0.23, hidden_coupling: 0.38, stale_docs: 0.25, tool_footgun: 0.67, flaky: 0.22, agent_bug: 0.76, wasted_effort: 0.42, user_correction: 0.13}
---
## Summary
Agents on this Mac write BSD-style in-place edits, `sed -i '' ...`, but the shell the Bash tool sources aliases `sed` to Homebrew's GNU sed. GNU sed only accepts an attached suffix for `-i`, so the separate `''` becomes the script (no `-e`) or a missing input file (with `-e`). In this session two subagents hit it three times; once the no-op was hidden behind `2>/dev/null || true` and only a follow-up grep showed the report text had not changed. The same `gsed: can't read` signature appears in 52 transcripts in this workspace.

## Symptom
- L404 (subagent a2d56f40): `sed -i '' -e 's#...#...#' throwaway.clj` printed `gsed: can't read : No such file or directory`; the edit did apply, though sed itself exits 2 in this form (reproduced).
- L511: two `sed -i '' 's/<old>/<new>/' "$f" 2>/dev/null || true` edits to a review report changed nothing; the greps right after still showed the old lines.
- L722 (subagent a5a0bba6): `sed -i '' 's#...:30-66`#...:29-67`#' <report>.md` failed with `gsed: can't read s#...#: No such file or directory`, exit 2.

## Timeline
- a2d56f40 L403-404: `-e` form; edit lands, bogus error, the agent moves on.
- a2d56f40 L510-511: two report edits run as silent no-ops behind `2>/dev/null || true`; the grep output shows them unapplied.
- a2d56f40 L514-517: the agent redoes both edits with the Edit tool.
- a5a0bba6 L721-722: same trap on a review report; L725-728 redone with Edit.
- Cost: three failed edits and three redo calls in one session; one edit would have shipped unapplied had the agent not grepped afterwards.

## Root cause
The user's `~/.zshrc` and `~/.zprofile` both define `alias sed=gsed`, and the Bash tool's shell snapshot carries aliases (`type sed` reports `sed is an alias for gsed`). GNU sed parses `-i` with an optional attached suffix only, so `sed -i '' 's/a/b/' f` means script `''`, files `s/a/b/` and `f`; with `-e`, `''` is an input file. Both behaviours reproduced under `PC/tmp` with `/opt/homebrew/bin/gsed`.

## Why agents fall for it
`sed -i ''` is the portable form on macOS, and the platform line says darwin. The error message names a file, not the flag, and agents often discard stderr on edits.

## Current state
Checked today: `type sed` in the tool shell is `alias for gsed`; both rc files still set the alias.

## Suggested fix
- Guard the alias to interactive shells (`[[ -o interactive ]] && alias sed=gsed`) or unalias it in the agent shell snapshot.
- Tell agents that `sed` in this shell is GNU sed: write `sed -i 's/.../'` with no `''`, or use the Edit tool.
- Hook: flag `sed -i ''` in Bash tool calls.

## Detection signal
`gsed: can't read : No such file or directory` or `gsed: can't read s/` (or `s#`) in a tool result, or a `sed -i ''` call followed by a grep that still shows the old text.

## Raw excerpts
```
L403 [CALL] Bash: S=<scratchpad>/<review dir>; sed -i '' -e 's#(ref t/\*initial-report-counters\*)#(ref clojure.test/*initial-report-counters*)#' [...] $S/throwaway.clj; /usr/bin/grep -n "report-counters\|test-vars" $S/throwaway.clj
L404 [RESULT] gsed: can't read : No such file or directory
80:  (binding [clojure.test/*report-counters* (ref clojure.test/*initial-report-counters*)]
L510 [CALL] Bash: f=<report>.md; sed -i '' 's/<old sentence>/<new sentence>/' "$f" 2>/dev/null || true; /usr/bin/grep -n "<new sentence>\|<old sentence>" "$f"; sed -i '' 's/^<old line>/<new line>/' "$f" 2>/dev/null || true; /usr/bin/grep -n "^<line prefix>" "$f"
L511 [RESULT] 131: [...] <old sentence>
3: <old line>
L514 [CALL] Edit <report>.md: old='<old sentence>' new='<new sentence>'
L721 [CALL] Bash: [...] sed -i '' 's#`server/middleware/exceptions.clj:30-66`#`server/middleware/exceptions.clj:29-67`#' <report>.md && /usr/bin/grep -n "exceptions.clj:" [...]
L722 [RESULT (ERROR)] Exit code 2 [...] gsed: can't read s#`server/middleware/exceptions.clj:30-66`#`server/middleware/exceptions.clj:29-67`#: No such file or directory
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/ea892f4f-4e3c-479f-b370-880a3afe35e8.jsonl
  lines: 1839-1844
  date: 2026-09-03
  jev: {any_papercut: 0.87, env_toolchain: 0.94, stale_state: 0.33, verify_mismatch: 0.50, misleading_code: 0.33, hidden_coupling: 0.75, stale_docs: 0.48, tool_footgun: 0.57, flaky: 0.31, agent_bug: 0.84, wasted_effort: 0.61, user_correction: 0.60}

L1839 `sed -i '' 's|MB_LLM_METABOT_PROVIDER = "anthropic/claude-sonnet-4-6"|…anthropic-2/…|' mise.local.toml`; L1840 `Exit code 2 ⏎ gsed: can't read s|…|: No such file or directory`; L1843 the same edit redone with a Python heredoc.

- Subagent a058 L83-L84: two `sed -i ''` edits in a mutation script fail the same way; perl rewrite at L91.
- Main L1839-L1840: repointing a setting in mise.local.toml fails.
- L1843-L1844: Python rewrite succeeds.
- Cost: two retries in one session, plus one mutation run against an unpatched file.

```
L1839 [CALL Bash] cd ~/src/mb/metabase && cp mise.local.toml $SCRATCH/mise.local.toml.bak && sed -i '' 's|MB_LLM_METABOT_PROVIDER = "anthropic/claude-sonnet-4-6"|MB_LLM_METABOT_PROVIDER = "anthropic-2/claude-sonnet-4-6"|' mise.local.toml && grep -n "MB_LLM_METABOT_PROVIDER" mise.local.toml
L1840 [RESULT (ERROR)] Exit code 2 ⏎ gsed: can't read s|MB_LLM_METABOT_PROVIDER = "anthropic/claude-sonnet-4-6"|MB_LLM_METABOT_PROVIDER = "anthropic-2/claude-sonnet-4-6"|: No such file or directory
L1843 [CALL Bash] cd ~/src/mb/metabase && python3 - <<'PY' ⏎ import io ⏎ p = "mise.local.toml" ⏎ … ⏎ io.open(p, "w", encoding="utf-8").write(s.replace(old, new)) ⏎ print("repointed") ⏎ PY
L1844 [RESULT] repointed ⏎ 19:MB_LLM_METABOT_PROVIDER = "anthropic-2/claude-sonnet-4-6"
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/777aa5d5-083a-4f62-99f6-2f91f01b0a26.jsonl
  lines: 904-916
  date: 2026-09-07
  jev: {any_papercut: 0.86, env_toolchain: 0.95, stale_state: 0.41, verify_mismatch: 0.11, misleading_code: 0.27, hidden_coupling: 0.66, stale_docs: 0.30, tool_footgun: 0.80, flaky: 0.88, agent_bug: 0.43, wasted_effort: 0.80, user_correction: 0.76}

- L905: `gsed: can't read s|^MB_LLM_METABOT_PROVIDER = "anthropic-2/claude-sonnet-4-6"|MB_LLM_METABOT_PROVIDER = "nonexistent/claude-sonnet-4-6"|: No such file or directory`.

- L904: `sed -i '' 's|^MB_LLM_METABOT_PROVIDER = ...|...|' mise.local.toml && grep ... && <restart the dev server>`.
- L905: exit 2, gsed error.
- L915-L916: same edit in Python, restart, health up after about 60 s.
- Cost: one failed call.

```
L904 [CALL] Bash: sed -i '' 's|^MB_LLM_METABOT_PROVIDER = "anthropic-2/claude-sonnet-4-6"|MB_LLM_METABOT_PROVIDER = "nonexistent/claude-sonnet-4-6"|' mise.local.toml && /usr/bin/grep -n "^MB_LLM_METABOT_PROVIDER" mise.local.toml && <restart the dev server>
L905 [RESULT (ERROR)] Exit code 2 | gsed: can't read s|^MB_LLM_METABOT_PROVIDER = "anthropic-2/claude-sonnet-4-6"|MB_LLM_METABOT_PROVIDER = "nonexistent/claude-sonnet-4-6"|: No such file or directory
L915 [CALL] Bash: python3 - <<'PY' | import pathlib | p = pathlib.Path("~/src/mb/metabase/mise.local.toml"); t = p.read_text() | ... p.write_text(t.replace(...))
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/21ad940c-c551-4b95-84ed-c73a3ac86c8a.jsonl
  lines: 746-752
  date: 2026-08-24
  jev: {any_papercut: 0.88, env_toolchain: 0.87, stale_state: 0.36, verify_mismatch: 0.48, misleading_code: 0.68, hidden_coupling: 0.83, stale_docs: 0.43, tool_footgun: 0.72, flaky: 0.64, agent_bug: 0.93, wasted_effort: 0.39, user_correction: 0.09}

L747: `gsed: can't read s/  These tests pin three properties:/  These tests pin four properties:/: No such file or directory`; the docstring stayed unchanged until L752.

- L746: `sed -i '' 's/  These tests pin three properties:/  These tests pin four properties:/' test/metabase/metabot/tools/shared/content_store_test.clj && grep -n "pin four" ...`.
- L747: gsed error; nothing edited.
- L752-753: the same change redone with a Python replace script.
- Cost: one failed call and one redo.

```
L746 [CALL] Bash: sed -i '' 's/  These tests pin three properties:/  These tests pin four properties:/' test/metabase/metabot/tools/shared/content_store_test.clj && grep -n "pin four" test/metabase/metabot/tools/shared/content_store_test.clj; sed -n '2800,2830p' src/metabase/agent_lib/representations/repair.clj
L747 [RESULT] gsed: can't read s/  These tests pin three properties:/  These tests pin four properties:/: No such file or directory
L752 [CALL] Bash: python3 - <<'PY' [...] old = "These tests pin three properties:" [...] t.write_text(s.replace(old, "These tests pin four properties:"))
L753 [RESULT] ok
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/367ade68-abaa-469f-ad27-a55947196cd0.jsonl
  lines: 111-117
  date: 2026-09-10
  jev: {any_papercut: 0.78, env_toolchain: 0.89, stale_state: 0.26, verify_mismatch: 0.93, misleading_code: 0.21, hidden_coupling: 0.32, stale_docs: 0.19, tool_footgun: 0.74, flaky: 0.88, agent_bug: 0.26, wasted_effort: 0.38, user_correction: 0.16}

- L112: `gsed: can't read s/"csv-parse": "\^5\.5\.6"/"csv-parse": "^7.0.2"/: No such file or directory`.

- L111-L112: BSD form fails, exit 2.
- L116-L117: `sed -i` without a suffix works.
- Cost: one call.

```
L111 [CALL] Bash: cd ~/src/mb/wt/<user>-bump-csv-parse && sed -i '' 's/"csv-parse": "\^5\.5\.6"/"csv-parse": "^7.0.2"/' package.json && grep -n 'csv-parse' package.json && git diff --stat
L112 [RESULT (ERROR)] Exit code 2 | gsed: can't read s/"csv-parse": "\^5\.5\.6"/"csv-parse": "^7.0.2"/: No such file or directory
L116 [CALL] Bash: cd ~/src/mb/wt/<user>-bump-csv-parse && sed -i 's/"csv-parse": "\^5\.5\.6"/"csv-parse": "^7.0.2"/' package.json && grep -n 'csv-parse' package.json && git diff --stat
L117 [RESULT] 93:    "csv-parse": "^7.0.2", | package.json | 2 +-
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/e43ac148-4781-45ad-9f7f-6177de8fd82f.jsonl
  lines: 349-389
  date: 2026-09-07
  jev: {any_papercut: 0.81, env_toolchain: 0.91, stale_state: 0.28, verify_mismatch: 0.51, misleading_code: 0.37, hidden_coupling: 0.81, stale_docs: 0.21, tool_footgun: 0.65, flaky: 0.31, agent_bug: 0.66, wasted_effort: 0.73, user_correction: 0.15}

L378: `gsed: can't read s|INSERT INTO <table> …|…|: File name too long ⏎ [exited with code 0]` followed by repro.clj line 39 still holding the old INSERT.

- L349-L350: `sed -i ''` patch chained with the JVM rerun; auto-backgrounded (L352).
- L353-L375: other checks while waiting.
- L376-L378: task output shows the gsed failure; repro.out still has the old error.
- L389: Python patch and rerun.
- Cost: a few minutes and three calls, plus a background task reported as `exited with code 0` although its first step failed.

```
L350 [CALL Bash] cd $SCRATCH && sed -i '' "s|INSERT INTO <table> (<columns>) VALUES (<long row list>)|INSERT INTO <table> (<columns>, <new column>) VALUES (<long row list>)|" repro.clj && /usr/bin/grep -n "<row name>" repro.clj && mise exec -- clojure -M:dev:test -e '(load-file "$SCRATCH/repro.clj")' …
L352 [RESULT] Command running in background with ID: <id>. Output is being written to: $TASKS/<id>.output. …
L378 [RESULT] gsed: can't read s|INSERT INTO <table> (<columns>) VALUES (<long row list>)|INSERT INTO <table> (<columns>, <new column>) VALUES (<long row list>)|: File name too long ⏎ ⏎ [exited with code 0] ⏎ === repro.clj line 39 === ⏎ (x! src "INSERT INTO …
L389 [CALL Bash] cd $SCRATCH && python3 - <<'PY' ⏎ import pathlib ⏎ p = pathlib.Path("repro.clj"); s = p.read_text() ⏎ …
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/97fb3e20-064e-4e3b-bcd7-74c54eba2291.jsonl
  lines: 709-1220
  date: 2026-09-16
  jev: {any_papercut: 0.86, env_toolchain: 0.55, stale_state: 0.24, verify_mismatch: 0.34, misleading_code: 0.64, hidden_coupling: 0.57, stale_docs: 0.29, tool_footgun: 0.73, flaky: 0.41, agent_bug: 0.92, wasted_effort: 0.45, user_correction: 0.06}

L709-L710: `sed -i '' ...` fails with `gsed: can't read s/(catch Exception e ...)/...: No such file or directory`, followed by grep output from the old log. L714: redone with `perl -0pi -e`. L1213-L1217: `(eval):1: defining function based on alias 'g'` and `(eval):1: parse error near '()'`; L1220: redone in Python.

- L709-L710: BSD-style in-place edit fails under the gsed alias; the chained test run is skipped and a stale log is printed.
- L714: switched to perl.
- L1213-L1217: helper function named `g` rejected, whole command aborted.
- L1220: switched to a Python script.
- Cost: two extra tool calls and one stale-log read that could have been taken as a new result.

```
L709 [CALL] Bash: D=~/src/mb/tmp/pr-82065-review-260916; sed -i '' 's/(catch Exception e {:error (ex-message e)})/(catch Exception e (.printStackTrace e) {:error (ex-message e) :data (dissoc (ex-data e) :value)})/' $D/extra/metabase/review_lead_grammar_fix_test.clj && $D/run-scratch.sh '[metabase.review-lead-grammar-fix-test]' > $D/lead-grammar-fix-test.log 2>&1; /usr/bin/grep -nE ... $D/lead-grammar-fix-test.log | head -25
L710 [RESULT] gsed: can't read s/(catch Exception e {:error (ex-message e)})/(catch Exception e (.printStackTrace e) {:error (ex-message e) :data (dissoc (ex-data e) :value)})/: No such file or directory | 8:FIXED schema, Ollama shape => {:error "Invalid input: ...
L714 [CALL] Bash: D=~/src/mb/tmp/pr-82065-review-260916; perl -0pi -e 's/\(catch Exception e \{:error \(ex-message e\)\}\)/(catch Exception e (.printStackTrace e) {:error (ex-message e)})/' $D/extra/metabase/review_lead_grammar_fix_test.clj && ...
L1213 [CALL] Bash: cd ~/src/mb/wt/review-pr-82065-260916 && g() { /usr/bin/grep -n -- "$2" "$1" | head -${3:-1} | sed "s|^|$1:|" | cut -c1-150; }; F=src/metabase/metabot/self/ollama/forced_calls.clj; g $F "(def cloud-instruction"; ...
L1217 [RESULT (ERROR)] Exit code 1 | (eval):1: defining function based on alias `g' | (eval):1: parse error near `()'
L1220 [CALL] Bash: cd ~/src/mb/wt/review-pr-82065-260916 && python3 - <<'EOF' | checks = { ...
```
