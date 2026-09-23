---
title: In the zsh Bash tool, `echo =====LABEL` is an `=command` expansion that fails with "(eval):1: ====LABEL not found" and aborts the rest of the command line, so eight chained read commands in a row returned nothing
slug: zsh-and-bsd-shell-quirks
kind: env-friction
impact: wasted-time
severity: high
status: open # Bash tool still runs zsh with EQUALS on
area: Claude Code Bash tool (zsh), section separators in compound commands
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/56bba9cc-7c7c-4702-a034-a52e575a7302.jsonl
    lines: 283-857
    date: 2026-09-08
    jev: {any_papercut: 0.61, env_toolchain: 0.67, stale_state: 0.17, verify_mismatch: 0.16, misleading_code: 0.20, hidden_coupling: 0.48, stale_docs: 0.33, tool_footgun: 0.57, flaky: 0.31, agent_bug: 0.15, wasted_effort: 0.73, user_correction: 0.87}
---
## Summary
The agent used `echo =====NAME` as section separators while reading a new repo. In zsh a word that starts with `=` is expanded to the path of the command named after it, so `echo =====SOURCES` fails with `(eval):1: ====SOURCES not found` and zsh drops the rest of the command list. Every `cat`, `ls` and `sed` after the first separator silently did not run. The same session also used `${PIPESTATUS[0]}`, which is empty in zsh.

## Symptom
- L286, L288, L292: the whole output of multi-command reads was a single line such as `(eval):1: ====SOURCES not found`.
- L290, L294, L296, L302: the first command ran, then the output stops at the next `echo =====...` with the same error; L284 exits 1 after printing only the first file.
- L856-L857: `echo "exit=${PIPESTATUS[0]}"` printed `exit=` with no value.

## Timeline
- L283-L302: eight consecutive Bash calls reading the new repository each die at their first `echo =====` separator.
- L308: the agent switches to quoted `echo '##### NAME'` separators without comment and re-issues the reads (L308, L311, L319, L323).
- L856-L857: later in the session `${PIPESTATUS[0]}` prints empty; the push result was still readable from stderr.
- Cost: 8 failed or truncated calls and 5 re-runs in the first minute of reading an unfamiliar repo.

## Root cause
The Bash tool executes commands through zsh (`(eval)` in the error). zsh has EQUALS expansion on by default: an unquoted word starting with `=` is replaced by the path of that command, and a failed lookup is a fatal expansion error for the command list. Repro in a scratch dir: `echo before; echo =====X; echo after` prints `before` and the error, never `after`. `PIPESTATUS` is a bash array; zsh uses lower-case `pipestatus`.

## Why agents fall for it
Agents write bash, and `echo =====` is a common bash idiom for separators. The error message names a "command" that the agent never meant to run, and the partial output looks like the separator was simply skipped, so the pattern gets repeated call after call.

## Current state
Not a repo issue. Reproduced in the current Bash tool: `echo =====X` still aborts the rest of the line.

## Suggested fix
- Run the agent shell with `setopt NO_EQUALS` (and `KSH_ARRAYS`/`SH_WORD_SPLIT` if bash compatibility is the goal), or run commands under bash.
- Tell agents in their instructions that the Bash tool is zsh: quote separators (`echo '== x'`), use `$pipestatus`, quote globs.

## Detection signal
Tool result matching `^\(eval\):\d+: =+\S* not found`; a command containing `echo =` unquoted; `PIPESTATUS` in a command when `$SHELL` is zsh.

## Raw excerpts
```
L285 [CALL] Bash: echo =====<LABEL>; cat <file>; echo; echo =====<LABEL>; cat <file>; ...
L286 [RESULT (ERROR)] Exit code 1 | (eval):1: ====<LABEL> not found
L287 [CALL] Bash: echo =====SOURCES; ls <dir>/; echo; ...; echo =====MANIFEST; head -60 <file>; ...
L288 [RESULT (ERROR)] Exit code 1 | (eval):1: ====SOURCES not found
L291 [CALL] Bash: echo =====PIPELINE; ls <dir>/ | head -40; echo =====JOBS; ls <dir>/; ...
L292 [RESULT (ERROR)] Exit code 1 | (eval):1: ====PIPELINE not found
L296 [RESULT (ERROR)] Exit code 1 | ... | (eval):19: ====SCHEMA-TOP not found
L302 [RESULT (ERROR)] Exit code 1 | ... | (eval):1: ====PYPI not found
L308 [CALL] Bash: echo '##### <LABEL>'; cat <file>; ...
L856 [CALL] Bash: ... git push --dry-run origin <branch> 2>&1 | tail -5; echo "exit=${PIPESTATUS[0]}"
L857 [RESULT] ... | exit=
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/c9770215-12da-4ae0-b3b7-9a6c0317621d/subagents/agent-a2d56f4019e02be3a.jsonl
  lines: 260-447
  date: 2026-09-18
  jev: {any_papercut: 0.77, env_toolchain: 0.82, stale_state: 0.25, verify_mismatch: 0.77, misleading_code: 0.23, hidden_coupling: 0.38, stale_docs: 0.25, tool_footgun: 0.67, flaky: 0.22, agent_bug: 0.76, wasted_effort: 0.42, user_correction: 0.13}

- L261 (subagent a2d56f40): `echo ======` printed `(eval):1: ===== not found` and the two greps after it never printed; the agent reran them at L264.
- L288: `grep ... bb.edn mage/*.edn` failed with `no matches found: mage/*.edn`, so the bb.edn half of the search was lost too; rerun at L290.
- L447: `grep -rn -i "bedrock" docs --include=*.md | ...` printed only `(eval):1: no matches found: --include=*.md`; the agent moved on to L449 without the search.
- L531 (subagent a5a0bba6): `grep ... resources/log4j2*.xml test_resources/log4j2*.xml` was dropped whole because the second glob matched nothing.
- L609 (a5a0bba6): `kill $pids` with a two-line `$pids` gave `illegal pid: 72555\n72546` (zsh does not word-split unquoted parameters).
- L407 and L498 (subagent a9de908a): `git show $r:src/metabase/metabot/context.clj` gave `(eval):1: bad substitution` four times, twice in the same session.
- L344 (a9de908a): `tail -n +$(cat logmark-b)` failed with `illegal offset -- +` because the mark was written from BSD `wc -l`, which pads with spaces.

- a2d56f40 L260-264: `echo ======` separator aborts the list; one rerun.
- a2d56f40 L287-290: unmatched `mage/*.edn` drops the bb.edn grep; one rerun.
- a2d56f40 L431-432: `.lintstagedrc*` glob fails at the end of a probe for prettier config.
- a2d56f40 L446-449: docs-wide search for other Bedrock mentions silently skipped during a PR review; never retried.
- a74b9156 L158-159: after `echo ======` failed, the restore of the throwaway worktree and the second mutation run never happened (redone at L162); abff3f4f L977-978: the file and log listing after `echo ======` never printed.
- a9de908a L343-346: padded `wc -l` mark breaks `tail -n +N`; the agent fell back to `tail -n 60`.
- a9de908a L406-409 and L497-501: `$r:path` and `$t:path` bad substitution in loops over release tags; each needed a rewrite with `${r}:`.
- a5a0bba6 L530-531, L608-611, L640-641: dropped log4j grep, unsplit `kill` args, `cat: illegal option -- A`.
- Cost: roughly 12 extra tool calls across five subagents, plus one review check that silently did not run.

```
L260 [CALL] Bash: cd ~/src/mb/wt/<review worktree> && sed -n '1,80p' .github/workflows/docs-links.yml; echo ======; /usr/bin/grep -n "prettier\|markdown\|\.md\|docs/" .github/workflows/lint.yml | head -30; echo =====; /usr/bin/grep -n "run:" .github/workflows/codespell.yml | head
L261 [RESULT (ERROR)] Exit code 1 [...] (eval):1: ===== not found
L287 [CALL] Bash: cd ~/src/mb/wt/<review worktree> && /usr/bin/grep -n "cljfmt-all\|cljfmt-files\|..." bb.edn mage/*.edn 2>/dev/null | head -20; ls mage 2>/dev/null | head; ...
L288 [RESULT] (eval):1: no matches found: mage/*.edn
L446 [CALL] Bash: cd ~/src/mb/wt/<review worktree> && /usr/bin/grep -n -i "bedrock\|mantle" docs/ai/providers.md | head -30; /usr/bin/grep -rn -i "bedrock" docs --include=*.md | /usr/bin/grep -v "..." | head -10
L447 [RESULT] [...providers.md lines...] (eval):1: no matches found: --include=*.md
L406 [CALL] Bash: for r in v0.61.3 origin/release-x.61.x ...; do echo "== $r"; git show $r:src/metabase/metabot/context.clj | /usr/bin/grep -n -A3 "..." | head -8; done
L407 [RESULT] == v0.61.3 (eval):1: bad substitution == origin/release-x.61.x (eval):1: bad substitution [...]
L343 [CALL] Bash: cd <scratchpad> && tail -n +$(cat logmark-b) <dev-ee log> | /usr/bin/grep -v "GET /api/health" | cut -c1-400 | head -40
L344 [RESULT] tail: illegal offset -- +: Invalid argument
L609 [RESULT] (eval):kill:1: illegal pid: 72555\n72546
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/8c776c72-ae8d-4ded-9d94-9661894ad0b6/subagents/agent-ac3e6b2d811e099e8.jsonl
  lines: 56-108
  date: 2026-09-04
  jev: {any_papercut: 0.92, env_toolchain: 0.95, stale_state: 0.57, verify_mismatch: 0.82, misleading_code: 0.36, hidden_coupling: 0.68, stale_docs: 0.25, tool_footgun: 0.89, flaky: 0.54, agent_bug: 0.52, wasted_effort: 0.80, user_correction: 0.06}

- L58: the per-branch greps for `reindex!` and `delete-obsolete-tables!` print headers and nothing else.
- L93: `diff` shows `0a1,13`, i.e. the release version of the function is empty.

- L56-L58: first loop over release branches returns nothing.
- L92-L93: diff against master shows the whole function as added.
- L99: the agent concludes, wrongly, that the diff was inverted and that the index.clj it first read was the old branch's version.
- L100-L103: re-reads index.clj on the current branch and repeats the comparison.
- L107-L108: the agent identifies that zsh read `$b:src/...` as a history modifier and fixes it with `${b}`.
- Cost: about 5 calls and a wrong intermediate conclusion about which source it had analysed.

```
L56 [CALL] Bash: cd ~/src/mb/metabase && git branch -r | grep -E "origin/release-x\.6[123]\.x$" ; for b in release-x.61.x release-x.62.x release-x.63.x; do echo "=== $b: core.clj reindex! ==="; git show origin/$b:src/metabase/search/appdb/core.clj 2>&1 | grep -n -A14 ...
L58 [RESULT] origin/release-x.61.x | ... | === release-x.61.x: core.clj reindex! === | === release-x.61.x: index.clj delete-obsolete-tables! / activate-table! / mocking guard === | === release-x.62.x: core.clj reindex! === ...
L93 [RESULT] === release-x.61.x vs master: delete-obsolete-tables! + activate-table! hunks === | 0a1,13 | > (defn- delete-obsolete-tables! [] ...
L108 [CALL] Bash: ... diff <(git show "origin/${b}:src/metabase/search/appdb/index.clj" | extract) <(extract < src/metabase/search/appdb/index.clj) ...
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/b9969651-5371-431a-b6c4-6d9916153234.jsonl
  lines: 69-455
  date: 2026-08-24
  jev: {any_papercut: 0.79, env_toolchain: 0.90, stale_state: 0.37, verify_mismatch: 0.44, misleading_code: 0.31, hidden_coupling: 0.70, stale_docs: 0.38, tool_footgun: 0.69, flaky: 0.84, agent_bug: 0.86, wasted_effort: 0.62, user_correction: 0.06}

- L70: `(eval):1: no matches found: --include=*.clj` then the output of the second half of the `&&` chain.
- L87: `(eval):1: no matches found: --include=*`.
- L450: `(eval):1: no matches found: --include=*.ts`.

- L69-75: search for `canonically-has-feature` dropped; rerun without the filter.
- L86-92: search for `is-hosted` dropped; rerun.
- L449-455: search for `required_any` dropped; rerun.
- Cost: 3 extra calls.

```
L69 [CALL] Bash: grep -rn "canonically-has-feature" --include=*.clj --include=*.cljc src/ enterprise/ test/ | head -30 && echo "=== core exports ===" && grep -n "canonically-has-feature\|is-hosted" src/metabase/premium_features/core.clj
L70 [RESULT] (eval):1: no matches found: --include=*.clj === core exports === 25:  canonically-has-feature? 99:  is-hosted?
L86 [CALL] Bash: grep -rn "is-hosted" src enterprise/backend/src frontend/src --include=* 2>/dev/null | grep -v "_test\|test/" | head -40
L87 [RESULT] (eval):1: no matches found: --include=*
L449 [CALL] Bash: grep -rn "required_any" frontend/src/metabase --include=*.ts --include=*.tsx | head -20
L450 [RESULT] (eval):1: no matches found: --include=*.ts
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/fbd9d67a-1fb0-4afe-973d-ba7d8c5d19d1/subagents/agent-a632b29c43867bb36.jsonl
  lines: 247-252
  date: 2026-09-17
  jev: {any_papercut: 0.76, env_toolchain: 0.36, stale_state: 0.33, verify_mismatch: 0.89, misleading_code: 0.27, hidden_coupling: 0.68, stale_docs: 0.27, tool_footgun: 0.64, flaky: 0.94, agent_bug: 0.48, wasted_effort: 0.51, user_correction: 0.54}

agent-a632 L248: `...transforms_test.clj :0:0: error: file does not exist` and `linting took 41ms, errors: 1` after 40 s of kondo cache warming; the next call wraps the same line in `bash -c`.

- agent-a342 L375-L379: curl option string not split; rewritten as a bash script.
- agent-a632 L14-L15: `echo ======` makes the doc-reading call exit 1.
- agent-a632 L247-L252: kondo gets one bogus path after 40 s; rerun under `bash -c`.
- agent-a6fd L342-L347: same `$FILES` failure; rerun through `xargs`.
- agent-a342 L1155-L1159: `$c:src/...` bad substitution; rerun with `${c}`.
- Cost: about six retries in the session, two of them 40 s kondo runs.

```
L247 [CALL] Bash: cd ~/src/mb/wt/<worktree> && ./bin/mage 2>&1 | /usr/bin/grep -i "cljfmt\|kondo" | head; FILES=$(git diff --name-only --diff-filter=AMR origin/master -- '*.clj' '*.cljc' | tr '\n' ' '); echo $FILES; time ./bin/mag
L248 [RESULT] cljfmt-staged               Runs cljfmt on staged files
    kondo-updated  [...2820 chars...]  error: file does not exist
    linting took 41ms, errors: 1, warnings: 0
    ./bin/mage kondo $FILES 2>&1  99.55s user 6.48s system 263% cpu 40.176 total
    tail -15  0.00s user 0.00s system 0% cpu 40.176 total
L251 [CALL] Bash: cd ~/src/mb/wt/<worktree> && bash -c 'FILES=$(git diff --name-only --diff-filter=AMR origin/master -- "*.clj" "*.cljc"); ./bin/mage kondo $FILES 2>&1 | tail -8; echo ===; ./bin/mage cljfmt-files $FILES 2>&1 | tai
-- subagent agent-a342a3a46659ac024 --
L376 [RESULT] curl: option --proxy http://<local-proxy> --cacert <ca-cert> -s: is unknown
-- main transcript --
L1075 [RESULT (ERROR)] Exit code 1 ... (eval):1: ====== not found
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/31c858da-b01f-4914-87ef-7f7df04bd7c0/subagents/agent-ad6dd18c355655af0.jsonl
  lines: 294-303
  date: 2026-09-14
  jev: {any_papercut: 0.83, env_toolchain: 0.91, stale_state: 0.33, verify_mismatch: 0.42, misleading_code: 0.31, hidden_coupling: 0.54, stale_docs: 0.31, tool_footgun: 0.76, flaky: 0.80, agent_bug: 0.55, wasted_effort: 0.59, user_correction: 0.17}

L294: in another repository, `FILES=$(git diff --name-only origin/master...HEAD | tr '\n' ' ') && ... pre-commit run --config <config> --files $FILES`; L295: every hook `(no files to check)Skipped`, exit 0. L298: the agent checks `git ls-files` to see why; L302-L303: with the six paths spelled out, every hook `Passed`.

- 13:43:00 L294 pre-commit with `--files $FILES`: all hooks Skipped, exit 0.
- L298 checks the scratch repo's `git ls-files` to understand the empty match.
- 13:43:18 L302-L303 explicit file list: all hooks Passed.
- agent-aaa437a5ce3094d55 L181-L182 (14:08): `PSQL="docker exec -i <container> psql -v ON_ERROR_STOP=1 -X"; $PSQL ...` fails with `zsh: command not found: docker exec -i <container> psql -v ON_ERROR_STOP=1 -X` for every step; L185-L187 moved into a bash script.
- agent-ad6dd18c355655af0 L360 wrote benchmark SQL with `echo "\\timing on"`; zsh's `echo` interprets `\t`, so L478-L479 (13:56) psql reports `ERROR:  syntax error at or near "iming"`; L482-L486 regenerated with printf and confirmed with `od -c`.
- `cat: illegal option -- A` at agent-a0128252768ece1b1 L59-L60, agent-a26424f0417d4520b L314-L315, agent-af8cee7a0125751d9 L541-L542, agent-ad6dd18c355655af0 L482-L483.
- Cost: a false-green hook run that could have gone into a review report, a wasted benchmark run, and about eight retries.

```
L295 [RESULT] Check Yaml....(no files to check)Skipped Fix End of Files....(no files to check)Skipped Trim Trailing Whitespace....(no files to check)Skipped ...
L303 [RESULT] Check Yaml....Passed Fix End of Files....Passed Trim Trailing Whitespace....Passed ... exit=0
L479 [RESULT] ... ERROR:  syntax error at or near "iming" ERROR:  syntax error at or near "iming"
L482 [CALL] ... { printf '%s\n' "set statement_timeout='1200s';" "begin;" '\timing on' "create temp table bench_out as"; ... } > $SP/bench/run-$v-$t.sql; ...; /usr/bin/grep -n 'timing' $SP/bench/run-head-alias.sql | cat -A | head -3
L483 [RESULT] cat: illegal option -- A usage: cat [-belnstuv] [file ...]
L486 [RESULT] 0000000    3   :   \   t   i   m   i   n   g       o   n  \n
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/7496be2b-9961-45b7-8797-6ed8b8fdfcc2.jsonl
  lines: 128-287
  date: 2026-09-11
  jev: {any_papercut: 0.78, env_toolchain: 0.59, stale_state: 0.23, verify_mismatch: 0.30, misleading_code: 0.45, hidden_coupling: 0.50, stale_docs: 0.29, tool_footgun: 0.85, flaky: 0.49, agent_bug: 0.43, wasted_effort: 0.43, user_correction: 0.10}

- L128-L133: `for p in "<repo> <n>" ...; do set -- $p; ...` left `$2` empty, so `gh pr view $2 --repo metabase/$1` failed with `argument required when using the --repo flag`.
- L283-L284: `/usr/bin/grep -rn <pattern> ... --include=*.py` aborted with `(eval):1: no matches found: --include=*.py`.
- L1264-L1265 (chunk .3): in another repository, `ls -d */*model* */*transform* ...` printed `no matches found: */*model*` and never evaluated the remaining globs.
- Subagent agent-ad84b20211c1242d4 L221-L222: `FILES="a b c"; pre-commit run $h --files $FILES` gave `(no files to check)Skipped` for check-yaml, end-of-file-fixer and trailing-whitespace.
- Subagent agent-aaebb819c1f2fde01 L80-L81: BSD-style `sed -i '' 's|...|'` failed with `gsed: can't read s|^import importlib.util|...: File name too long`.
- Subagent agent-ae3923bd48afbbf5d L266-L268: `cat -A` failed with `cat: illegal option -- A`.

- L128-L137: positional-split loop fails; rewritten as separate `gh pr view` calls.
- L283-L287: grep aborted by the unquoted `--include=*.py`; re-run with the glob quoted.
- L1264-L1265: glob probe aborts; the next answer to the user states that the repository has no such layer, partly on this evidence.
- agent-ad84b20211c1242d4 L221-L233: pre-commit reports Skipped for the changed files; the agent falls back to `--all-files` (L225-L226), which rewrites unrelated files it then reverts with `git checkout -- $(git diff --name-only)` (L229), and only an inline file list (L232-L233) runs the hooks.
- agent-aaebb819c1f2fde01 L80-L84: sed edit fails, redone as a python edit.
- agent-ae3923bd48afbbf5d L266-L271: `cat -A` fails, file re-read with plain `sed`.
- Cost: about 8 extra tool calls across four transcripts, one false `Skipped` hook run, one revert of unrelated files, and one claim to the user resting on an aborted command.

```
L128 [CALL] for p in "metabase <n>" "<repo> <n>" ...; do set -- $p; echo "=== $1#$2 ==="; gh pr view $2 --repo metabase/$1 --json isDraft,... 2>&1; done
L133 [RESULT (ERROR)] Exit code 1 | === metabase <n># | argument required when using the --repo flag
L1265 [RESULT] ... | (eval):1: no matches found: */*model* | ...
L222 [RESULT] (subagent ad84b) Check Yaml....(no files to check)Skipped | Fix End of Files....(no files to check)Skipped | Trim Trailing Whitespace....(no files to check)Skipped
L229 [CALL] (subagent ad84b) git checkout -- $(git diff --name-only) && git status --short
L80 [CALL] (subagent aaebb) cd $SP && python3 -c "import sys;print(sys.version)" && sed -i '' 's|^import importlib.util|import types\n...|' scan.py
L81 [RESULT (ERROR)] (subagent aaebb) Exit code 2 | 3.14.7 ... | gsed: can't read s|^import importlib.util|import types\n...: File name too long
L266 [CALL] (subagent ae39) sed -n '90,140p' test/metabase/analytics/llm_token_usage_test.clj | cat -A | sed 's/\$$//' | /usr/bin/grep -n ...
L268 [RESULT] (subagent ae39) cat: illegal option -- A | usage: cat [-belnstuv] [file ...]
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/367ade68-abaa-469f-ad27-a55947196cd0.jsonl
  lines: 524-784
  date: 2026-09-10
  jev: {any_papercut: 0.88, env_toolchain: 0.85, stale_state: 0.39, verify_mismatch: 0.64, misleading_code: 0.21, hidden_coupling: 0.17, stale_docs: 0.17, tool_footgun: 0.88, flaky: 0.96, agent_bug: 0.32, wasted_effort: 0.84, user_correction: 0.43}

- L525: `(eval):1: no matches found: --include=*.ts`.
- L658: `(eval):6: defining function based on alias `g'` and `parse error near `()'`.
- L771: `runs sampled: 22` followed by `H2 (OSS) 0/0 failed`, `group-06-ee 0/0 failed`, ...; L776: the jobs file has 0 lines.

- L524-L525: grep aborted by glob no-match; the agent moves on without that search.
- L657-L658: table builder fails on alias `g`; L662 renamed to `pick()`.
- L770-L776: base-rate sampling returns 0/0; agent checks the file (0 lines) and a single API call (works).
- L780-L785: rewritten with `while read -r r`; 5174 job rows, real base rates.
- Cost: 4 wasted calls, one skipped search, and a near-miss "0/0" statistic.

```
L524 [CALL] Bash: /usr/bin/grep -rln '...' e2e frontend enterprise 2>/dev/null | head; echo "=== guard source ==="; /usr/bin/grep -rln '...' enterprise/frontend/src --include=*.ts --include=*.tsx 2>/dev/null | ...
L525 [RESULT] ... | === guard source === | (eval):1: no matches found: --include=*.ts
L657 [CALL] Bash: ... for p in 82266 82265 ...; do | j=$(gh pr checks $p --repo metabase/metabase --json name,bucket 2>/dev/null) | ... | g(){ jq -r --arg re "$1" '...' <<<"$j"; } | ...
L658 [RESULT (ERROR)] Exit code 1 | (eval):6: defining function based on alias `g' | (eval):6: parse error near `()'
L770 [CALL] Bash: ... runs=$(gh api 'repos/metabase/metabase/actions/workflows/142551063/runs?per_page=100&created=2026-09-10' --jq '...' 2>/dev/null | head -22) | ... | for r in $runs; do | gh api "repos/metabase/metabase/actions/runs/$r/jobs?per_page=100" --paginate --jq '...' 2>/dev/null | done > <scratchpad>/jobs.tsv ...
L771 [RESULT] runs sampled: 22 | H2 \(OSS\)                 0/0 failed | group-06-ee                0/0 failed | group-18-ee                0/0 failed | ...
L776 [RESULT] 0 | --- single test --- | 100
L784 [CALL] Bash: ... : > $S/jobs.tsv | while read -r r; do | gh api "repos/metabase/metabase/actions/runs/$r/jobs?per_page=100" --paginate ... >> $S/jobs.tsv 2>/dev/null | done < $S/runids.txt ...
L785 [RESULT] 5174 | H2 \(OSS\)               2/36 runs failed | group-06-ee              6/27 runs failed | ...
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/ea892f4f-4e3c-479f-b370-880a3afe35e8/subagents/agent-a91fe9c8a78bb0afa.jsonl
  lines: 35-51
  date: 2026-09-03
  jev: {any_papercut: 0.77, env_toolchain: 0.67, stale_state: 0.19, verify_mismatch: 0.82, misleading_code: 0.24, hidden_coupling: 0.46, stale_docs: 0.26, tool_footgun: 0.68, flaky: 0.55, agent_bug: 0.22, wasted_effort: 0.61, user_correction: 0.05}

L36, L40, L42: `(eval):1: no matches found: --include=*.clj` and `--include=*.ts` for three separate commands. In subagent afc73 L82: kondo `…self_test.clj:0:0: error: file does not exist` for the glued path, cljfmt `All source files formatted correctly`, and `kondo exit: ` / `cljfmt exit: ` with empty values.

- Subagents a058 L38-L40, ab0b L28-L29, ab99 L22-L24 and af05 L25-L31: the same `--include=*.ts|*.clj` failure, each followed by a quoted rerun.
- a91f L35-L42: three greps fail in a row; L50 the agent quotes the `--include` patterns and reruns.
- afc73 L42-L45: two more; L80-L82: `$FILES` unsplit, `${PIPESTATUS[0]}` empty; L93 the agent notices its kondo and cljfmt calls never ran on real files because of the quoting.
- Cost: about 12 wasted tool calls across six subagents, and one lint result that would have been a false green without the kondo error beside it.

```
L35 [CALL Bash] cd ~/src/mb/wt/<branch> && echo "== backend defsettings ==" && grep -rn -B2 -A25 "defsetting metabot-show-illustrations\|…" --include=*.clj enterprise/backend/src src …
L36 [RESULT] == backend defsettings == ⏎ (eval):1: no matches found: --include=*.clj ⏎ == all clj mentions == ⏎ (eval):1: no matches found: --include=*.clj
L40 [RESULT] == FE consumers of settings == ⏎ (eval):1: no matches found: --include=*.ts ⏎ == spec mentions == ⏎ (eval):1: no matches found: --include=*.ts
L42 [RESULT] == empty-state copy consumers == ⏎ (eval):1: no matches found: --include=*.ts ⏎ == side panel empty state / greeting files == ⏎ (eval):1: no matches found: --include=*.ts
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/d54d5742-b467-4ed2-ae1a-c528e2cf481b/subagents/agent-afe6fd57ff2d28608.jsonl
  lines: 50-83
  date: 2026-09-09
  jev: {any_papercut: 0.78, env_toolchain: 0.82, stale_state: 0.10, verify_mismatch: 0.14, misleading_code: 0.24, hidden_coupling: 0.35, stale_docs: 0.18, tool_footgun: 0.76, flaky: 0.21, agent_bug: 0.22, wasted_effort: 0.48, user_correction: 0.06}

- L51: `########## azure ########## (eval):5: bad substitution` repeated for all 11 adapters.
- L54-83: `cat > <scratchpad>/audit.sh <<'EOF' #!/bin/bash ... EOF; bash .../audit.sh`, then s2.sh to s7.sh.
- Lead session L535: `cat: illegal option -- A`.

- L50-51: loop fails for every file.
- L54-55: the same loop as a bash script works.
- L62-83: every later git command written to a new script file first.
- Cost: one wasted call plus a heavier pattern for the rest of the review.

```
L50 [CALL] Bash: cd ~/src/mb/wt/<review worktree> BASE=<sha> for n in azure bedrock claude deepseek google mistral moonshot openai openrouter vllm zai; do echo "########## $n ##########"; git show $BASE:src/metabase/metabot/self/$n.clj | /usr/bin/grep -n -E '...'; echo; done
L51 [RESULT] ########## azure ########## (eval):5: bad substitution ########## bedrock ########## (eval):5: bad substitution [...]
L54 [CALL] Bash: cd ~/src/mb/wt/<review worktree> cat > <scratchpad>/audit.sh <<'EOF' #!/bin/bash [...] git show "$BASE:src/metabase/metabot/self/$n.clj" | /usr/bin/grep -n -E '...' [...] EOF bash <scratchpad>/audit.sh
L55 [RESULT] ########## azure ########## 29:   [metabase.util.o11y :refer [with-span]])) 37:(defn- model->family [...]
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/f01adc7f-28f4-43e5-b887-741dd29d83e6.jsonl
  lines: 46-211
  date: 2026-09-10
  jev: {any_papercut: 0.79, env_toolchain: 0.88, stale_state: 0.20, verify_mismatch: 0.14, misleading_code: 0.30, hidden_coupling: 0.40, stale_docs: 0.27, tool_footgun: 0.67, flaky: 0.27, agent_bug: 0.16, wasted_effort: 0.79, user_correction: 0.06}

- L91: `(eval):1: no matches found: --include=*.clj` after the `git log` line; the search for "vertex" did not run.
- L203, L205, L211: `====SETTINGS not found`, `====SELF not found`, `====DOCS not found`, each after only the first section.

- L85-L91: a grep dropped by a glob error.
- L202-L211: three consecutive code-reading commands each stop after their first part; the agent falls back to Read calls (L216).
- Cost: several commands with most output lost and follow-up calls to recover it.

```
L85 [CALL] Bash: git fetch origin master --quiet 2>&1 | tail -2; git log origin/master --oneline -1; /usr/bin/grep -rli "vertex" --include=*.clj --include=*.cljc --include=*.ts --include=*.tsx --include=*.md ... src enterprise/backend/src ...
L91 [RESULT] 4d60c4bcf5f docs - nav link check (#82211) | (eval):1: no matches found: --include=*.clj
L202 [CALL] Bash: cd ~/src/mb/metabase && sed -n 1,80p src/metabase/metabot/self/google/stream_generate_content.clj; echo =====SETTINGS; git grep -n -B3 -A25 "defn- validate-google-model!" -- src/metabase/metabot/settings.clj; echo =====PUBLISHERS; ...
L203 [RESULT (ERROR)] Exit code 1 | (ns metabase.metabot.self.google.stream-generate-content | ... | (eval):1: ====SETTINGS not found
L205 [RESULT (ERROR)] Exit code 1 | :default-model "deepseek-v4-pro" | ... | (eval):1: ====SELF not found
L211 [RESULT (ERROR)] Exit code 1 | (eval):1: ====DOCS not found
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/ac37fe71-7046-48c1-885f-5bf5d9754c26.jsonl
  lines: 1846-1877
  date: 2026-09-10
  jev: {any_papercut: 0.82, env_toolchain: 0.91, stale_state: 0.33, verify_mismatch: 0.46, misleading_code: 0.18, hidden_coupling: 0.30, stale_docs: 0.30, tool_footgun: 0.77, flaky: 0.42, agent_bug: 0.19, wasted_effort: 0.49, user_correction: 0.09}

- L1847: `failing: 1` for all four PRs; L1853: `could not`; L1868: `could not determine current branch`; L1872: `Could not resolve to a Repository with the name 'metabase/<repo> <n>'`.
- L367: `(eval):46: no matches found: psycopg[binary]`; L477: `(eval):1: no matches found: repos/<owner>/<repo>/git/trees/main?recursive=1`; L275: `no matches found: <dir>/*.py`.

- L274-L275, L366-L367, L476-L477: three commands abort on globbing; each is re-run with quoting.
- L1846-L1847: CI status loop reports every PR as failing.
- L1852-L1872: two more loop variants fail the same way (one from a non-git directory adds a second error).
- L1876-L1877: separate `gh pr view` calls show all checks green.
- Cost: about 8 extra calls and a false "all PRs failing" signal that could have been reported as CI red.

```
L1846 [CALL] Bash: cd ~/src/mb && for pr in "metabase/<repo-a> <n>" "metabase/<repo-b> <n>" ...; do set -- $pr; echo "== $1#$2"; gh pr checks "$2" --repo "$1" 2>&1 | /usr/bin/grep -cE "fail" | sed 's/^/failing: /'; done
L1847 [RESULT] == metabase/<repo-a> <n># | failing: 1 | == metabase/<repo-b> <n># | failing: 1 | ... | failing: 1
L1853 [RESULT] == metabase/<repo-a> <n># | could not | | == metabase/<repo-b> <n># | could not
L1868 [RESULT] == metabase/<repo-a> <n># | could not determine current branch: failed to run git: fatal: not a git repository (or any of the parent directories): .git
L1872 [RESULT] == metabase/<repo-a> <n># | GraphQL: Could not resolve to a Repository with the name 'metabase/<repo-a> <n>'. (repository) | ...
L1877 [RESULT] [{"c":"SUCCESS","n":"What changed"},{"c":"SUCCESS","n":"Analyze (actions)"}, ...]
L367 [RESULT (ERROR)] Exit code 1 | (eval):46: no matches found: psycopg[binary]
L476 [CALL] Bash: gh api repos/<owner>/<repo>/git/trees/main?recursive=1 --jq '...' 2>&1 | head -30; ...
L477 [RESULT] (eval):1: no matches found: repos/<owner>/<repo>/git/trees/main?recursive=1 | ...
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/8c776c72-ae8d-4ded-9d94-9661894ad0b6.jsonl
  lines: 3014-3019
  date: 2026-09-11
  jev: {any_papercut: 0.62, env_toolchain: 0.45, stale_state: 0.34, verify_mismatch: 0.35, misleading_code: 0.22, hidden_coupling: 0.46, stale_docs: 0.34, tool_footgun: 0.66, flaky: 0.73, agent_bug: 0.76, wasted_effort: 0.46, user_correction: 0.76}

- L3015: ten Python tracebacks ending in `json.decoder.JSONDecodeError: Expecting value: line 1 column 1 (char 0)`, no gh error visible.

- L3014: `for spec in "<owner>/<repo> <n>" ...; do set -- $spec; gh pr view $2 --repo $1 ... 2>/dev/null | python3 -c "json.load(...)"`.
- L3015: JSONDecodeError for every PR; `2>/dev/null` hid gh's own error.
- L3019: agent rewrites the loop as a Python script with subprocess and explicit repo/number pairs.
- Cost: one failed call and a script rewrite.

```
L3014 [CALL] Bash: cd /tmp && for spec in "<owner>/<repo-a> <n>" "<owner>/<repo-a> <n>" "<owner>/<repo-b> <n>" ...; do | set -- $spec | gh pr view $2 --repo $1 --json number,title,... 2>/dev/null | python3 -c " | import json,sys | p=json.load(sys.stdin) ...
L3015 [RESULT (ERROR)] Exit code 1 | Traceback (most recent call last): |   File "<string>", line 3, in <module> |     p=json.load(sys.stdin) | ... json.decoder.JSONDecodeError: Expecting value: line 1 column 1 (char 0)
L3019 [CALL] Bash: cat > <scratchpad>/prs.py <<'PY' | import json,subprocess | specs=[("<owner>/<repo-a>",<n>),("<owner>/<repo-a>",<n>),...
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/31e1a415-680c-4ede-a3d2-fbb1d6e6a89c/subagents/agent-a30dfe6e4a2afcd26.jsonl
  lines: 122-125
  date: 2026-08-26
  jev: {any_papercut: 0.84, env_toolchain: 0.91, stale_state: 0.33, verify_mismatch: 0.46, misleading_code: 0.20, hidden_coupling: 0.57, stale_docs: 0.55, tool_footgun: 0.61, flaky: 0.42, agent_bug: 0.62, wasted_effort: 0.39, user_correction: 0.07}

- L122-L123: `grep -rln "AdminSettingInput" frontend/src ... --include=*.tsx --include=*.ts -l | ... | wc -l` → `(eval):1: no matches found: --include=*.tsx`, `0`.
- L124-L125: the quoted version → `35`, `27`.
- L64-L65: `... && echo ======= && ...` → `(eval):1: ====== not found`.
- Main transcript L1207-L1208: `echo ===` → `(eval):1: == not found`.
- Main transcript L1116-L1117 and subagent agent-ab7adbcea1498f2c8 L82-L83: unmatched path globs abort a grep.
- Subagent agent-ac949dc44885b8ee9 L61-L62: `echo ===` again.

- agent-a30dfe6e4a2afcd26 L64-L65: separator error, re-read with Read.
- agent-a30dfe6e4a2afcd26 L122-L125: count of `0`, re-run with quotes gives 35.
- agent-ab7adbcea1498f2c8 L82-L83, agent-ac949dc44885b8ee9 L61-L62: one retry each.
- Main L1116-L1117: part of a grep silently skipped; L1207-L1212: separator error, retried with `---SEP---`.
- Cost: about 6 retries and one wrong intermediate count.

```
L122 [CALL] cd ~/src/mb/wt/<branch> && grep -rln "<AdminSettingInput\|AdminSettingInput\b" frontend/src enterprise/frontend/src --include=*.tsx --include=*.ts -l | grep -v "AdminSettingInput" | head -40 | wc -l; grep -rln "AdminSettingInput" frontend/src enterprise/frontend/src --include=*.unit.spec.tsx | head
L123 [RESULT] (eval):1: no matches found: --include=*.tsx |        0 | (eval):1: no matches found: --include=*.unit.spec.tsx
L124 [CALL] cd ~/src/mb/wt/<branch> && grep -rl "AdminSettingInput" frontend/src enterprise/frontend/src --include="*.tsx" | wc -l && ...
L125 [RESULT] 35 |       27
L64 [CALL] cd ~/src/mb/wt/<branch> && sed -n 55,115p <spec> && echo ======= && sed -n 250,280p <spec>
L65 [RESULT (ERROR)] Exit code 1 | ... | (eval):1: ====== not found
L1208 [RESULT (ERROR)] (main) Exit code 1 | 2026-08-26 Wed | (eval):1: == not found
L1117 [RESULT] (main) ... | (eval):1: no matches found: src/metabase/config_from_file* | enterprise/backend/src/metabase_enterprise/advanced_config/file.clj
L83 [RESULT] (subagent ab7a) (eval):1: no matches found: resources/clj-kondo* | ...
L62 [RESULT (ERROR)] (subagent ac949) Exit code 1 | ... | (eval):1: == not found
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/9dd8c188-d287-4887-8028-38fe44df4427.jsonl
  lines: 142-156
  date: 2026-09-11
  jev: {any_papercut: 0.81, env_toolchain: 0.86, stale_state: 0.31, verify_mismatch: 0.07, misleading_code: 0.18, hidden_coupling: 0.39, stale_docs: 0.16, tool_footgun: 0.74, flaky: 0.33, agent_bug: 0.45, wasted_effort: 0.51, user_correction: 0.09}

L143: `total: 79 keep: 6 delete: 79` and `MISSING <wt-1> <wt-2> <wt-3> <wt-4> <wt-5> <wt-6>` on one line.

- L142 (21:06 UTC): keep list as a space-separated string, filter loop over `$KEEP`.
- L143: delete list contains every directory; the check prints all keepers as one missing name.
- L147-L148: rebuilt with `keep=(...)` (a zsh array); keepers confirmed present.
- L156-L157: the array-based removal loop is blocked by the auto-mode classifier.
- L161-L194: removals run as explicit one-path-per-line batches.
- Cost: a near miss that would have deleted six worktrees holding in-flight branches and uncommitted work, caught only by the agent's own sanity check; plus a rewrite of the script.

```
L142 [CALL] Bash: cd ~/src/mb/wt | KEEP="<wt-1> <wt-2> <wt-3> <wt-4> <wt-5> <wt-6>" | ls -d */ | sed 's#/$##' > <scratchpad>/all.txt | : > <scratchpad>/del.txt | while read -r d; do | skip=0 | for k in $KEEP; do [ "$d" = "$k" ] && skip=1; done | [ $skip -eq 0 ] && echo "$d" >> <scratchpad>/del.txt ...
L143 [RESULT] total: 79 keep: 6 delete: 79 | --- keepers present? --- | MISSING <wt-1> <wt-2> <wt-3> <wt-4> <wt-5> <wt-6>
L147 [CALL] Bash: cd ~/src/mb/wt | keep=(<wt-1> <wt-2> <wt-3> <wt-4> <wt-5> <wt-6>) | for k in $keep; do [ -d "$k" ] && echo "ok $k" || echo "GONE $k"; done ...
L148 [RESULT] ok <wt-1> | ok <wt-2> | ok <wt-3> | ok <wt-4> | ok <wt-5> | ok <wt-6> | --- current count --- | 79
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/43c18504-de2f-4b9e-999c-99fbc7a01bbc.jsonl
  lines: 686-699
  date: 2026-09-04
  jev: {any_papercut: 0.89, env_toolchain: 0.94, stale_state: 0.31, verify_mismatch: 0.80, misleading_code: 0.22, hidden_coupling: 0.67, stale_docs: 0.31, tool_footgun: 0.86, flaky: 0.87, agent_bug: 0.90, wasted_effort: 0.53, user_correction: 0.53}

L687: headers `=== gen-table-name / orphan-indexes (58) ===` and `=== maybe-create-pending! ... (58) ===` with nothing under them, then `fatal: ambiguous argument 'origin/release-x.58.xch_index_metadata.clj'`.

- L76-L77: `(eval):1: no matches found: --include=*.clj`; the lookup is redone without the flag.
- L686-L687: `$R:src/...` mangled; two sections silently empty.
- L698-L700: agent reruns the same reads with `sed` inside the release worktree.
- Cost: two wasted calls and a moment where missing output could have been read as missing code.

```
L76 [CALL] Bash: grep -n "delete-obsolete-tables" test/metabase/search/appdb/index_test.clj; grep -rn "delete-obsolete-tables" test/ enterprise/ --include=*.clj | grep -v index_test.clj; echo ---HELPE
L77 [RESULT] (eval):1: no matches found: --include=*.clj
    ---HELPERS---
    (eval):1: no matches found: --include=*.clj
L686 [CALL] Bash: cd ~/src/mb/metabase; R=origin/release-x.58.x; echo "=== gen-table-name / orphan-indexes (58) ==="; git show $R:src/metabase/search/appdb/index.clj | sed -n '/defn gen-table-name/,/^$/p;/defn- orphan-indexes/,/^$/p'; echo "=== maybe-create-pe
L687 [RESULT] === gen-table-name / orphan-indexes (58) ===
    === maybe-create-pending! / ensure-ready! / activate-table! / reset-index! (58) ===
    === delete-obsolete! model (58) ===
    fatal: ambiguous argument 'origin/release-x.58.xch_index_metadata.clj': unknown revision or path not in the working tree.
    Use '--' to separate paths from revisions, like this:
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/c9e08d36-c34d-4cc5-8d80-81c8c80b1f99.jsonl
  lines: 1372-1385
  date: 2026-09-11
  jev: {any_papercut: 0.88, env_toolchain: 0.89, stale_state: 0.34, verify_mismatch: 0.88, misleading_code: 0.18, hidden_coupling: 0.50, stale_docs: 0.29, tool_footgun: 0.78, flaky: 0.95, agent_bug: 0.84, wasted_effort: 0.38, user_correction: 0.35}

L1373: `#'cljfmt.tool/fixing src/…/client.clj src/…/uploads.clj … test/…/uploads_test.clj...` (one string) and kondo `…:0:0: error: file does not exist`; L1377: the agent notes that zsh does not word-split unquoted variables, so kondo got one glued argument; L1823: `(eval):6: no matches found: slack-file-url?`.

- L1372-L1377: glued path; rerun with explicit paths at L1378-L1385.
- Chunk 2, L899: `(eval):test:11: unknown condition: -eq` ends a verification script early; L903 rerun.
- L1822-L1828: symbol loop aborts on `slack-file-url?`; rerun with quoted names.
- Cost: three reruns and one near false-green formatter pass.

```
L1372 [CALL Bash] cd ~/src/mb/metabase ⏎ F="src/metabase/slackbot/client.clj src/metabase/slackbot/uploads.clj src/metabase/slackbot/events.clj test/metabase/slackbot/client_test.clj test/metabase/slackbot/uploads_test.clj" ⏎ echo "=== cljfmt ==="; mise exec -- ./bin/mage cljfmt-files $F 2>&1 | tail -3 ⏎ echo "=== kondo ==="; mise exec -- ./bin/mage kondo $F 2>&1 | tail -2
L1373 [RESULT] === cljfmt === ⏎ #'cljfmt.tool/fixing src/metabase/slackbot/client.clj src/metabase/slackbot/uploads.clj src/metabase/slackbot/events.clj test/metabase/slackbot/client_test.clj test/metabase/slackbot/uploads_test.clj... ⏎ === kondo === ⏎ src/metabase/slackbot/client.clj src/metabase/slackbot/uploads.clj … test/metabase/slackbot/uploads_test.clj:0:0: error: file does not exist
L1822 [CALL Bash] cd ~/src/mb/metabase ⏎ … for sym in download-file-stream slack-file-url? slack-file-hosts redirect-target copy-to-file! …; do …
L1823 [RESULT (ERROR)] Exit code 1 ⏎ === files our branch changes vs master === ⏎ … ⏎ (eval):6: no matches found: slack-file-url?
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/17ced372-740e-4ab7-a0be-3ea30f2f9a1c.jsonl
  lines: 548-584
  date: 2026-09-07
  jev: {any_papercut: 0.94, env_toolchain: 0.89, stale_state: 0.50, verify_mismatch: 0.64, misleading_code: 0.21, hidden_coupling: 0.26, stale_docs: 0.28, tool_footgun: 0.94, flaky: 0.98, agent_bug: 0.37, wasted_effort: 0.85, user_correction: 0.43}

- L548: Monitor script with `declare -A R=(...)`, `${#R[@]}`, `${!R[@]}`.
- L556-L559: `Monitor ... script failed (exit 1)`, `[stderr] (eval):6: bad substitution`.
- L564: the agent notes that `${!R[@]}` is bash syntax and not valid in zsh.
- L565: rewrite with `PAIRS="id=label id=label ..."` and `for p in $PAIRS`.
- L574: event `RED (failure) - 79877 Run tests 34150016429: ...` and `all watched runs finished`.
- L577: the agent reports that zsh word-splitting mangled the monitor's labels and that the monitor exited early.

- L548-L559: first watcher dies.
- L564-L566: rewrite started.
- L574: misleading event.
- L577-L584: manual status check of all five runs.
- Cost: 2 failed watchers, one event that misattributed failures between PRs, 1 manual check.

```
L548 [CALL] Monitor: {"command": "cd ~/src/mb/metabase\ndeclare -A R=( [34149610038]=\"79877 Run tests\" [34150016429]=\"81200 Run tests\" ... )\nleft=${#R[@]}\nwhile [ $left -gt 0 ]; do\n  sleep 60\n  for id in \"${!R[@]}\"; do ...
L559 [RESULT] [stderr] (eval):6: bad substitution | [exited with code 1]
L565 [CALL] Monitor: {"command": "cd ~/src/mb/metabase\nPAIRS=\"34149610038=79877_Run_tests 34150016429=81200_Run_tests ...\"\n...\n  for p in $PAIRS; do\n    id=$(echo \"$p\" | cut -d= -f1); label=$(echo \"$p\" | cut -d= -f2 | tr '_' ' ') ...
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/9a88b72e-3629-4bc8-8ad6-2e2604ad3d18.jsonl
  lines: 48-53
  date: 2026-09-02
  jev: {any_papercut: 0.71, env_toolchain: 0.48, stale_state: 0.25, verify_mismatch: 0.68, misleading_code: 0.18, hidden_coupling: 0.26, stale_docs: 0.31, tool_footgun: 0.60, flaky: 0.88, agent_bug: 0.41, wasted_effort: 0.31, user_correction: 0.08}

L49: `--- import sources: ⏎ (eval):1: no matches found: --include=*.tsx ⏎ --- which module: ⏎ (eval):1: no matches found: --include=*.tsx`.

- L48-L49: two greps abort.
- L52-L53: quoted rerun succeeds.
- Cost: one retry.

```
L48 [CALL Bash] grep -rn "useDisclosure" frontend/src/metabase/ui/index.ts frontend/src/metabase/ui/ 2>/dev/null | head -5; echo "--- import sources:"; grep -rhn "useDisclosure" frontend/src --include=*.tsx --include=*.ts -B0 | head -3; echo "--- which module:"; grep -rh "import.*useDisclosure.*from" frontend/src --include=*.tsx --include=*.ts | …
L49 [RESULT] --- import sources: ⏎ (eval):1: no matches found: --include=*.tsx ⏎ --- which module: ⏎ (eval):1: no matches found: --include=*.tsx
L52 [CALL Bash] grep -rh 'useDisclosure' frontend/src --include='*.tsx' --include='*.ts' | grep 'from' | sort | uniq -c | sort -rn | head
L53 [RESULT] 106 import { useDisclosure } from "@mantine/hooks"; …
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/96d0c640-59ab-460e-a02f-22ef7f27d71e.jsonl
  lines: 448-630
  date: 2026-09-14
  jev: {any_papercut: 0.71, env_toolchain: 0.81, stale_state: 0.15, verify_mismatch: 0.26, misleading_code: 0.29, hidden_coupling: 0.45, stale_docs: 0.44, tool_footgun: 0.72, flaky: 0.65, agent_bug: 0.45, wasted_effort: 0.24, user_correction: 0.26}

L592: `(eval):1: no matches found: ~/Pictures/Screenshots/*.png` and no ls output at all. L630: the agent tells the user the pasted screenshot is not saved anywhere on disk. L453: `cat: illegal option -- A`.

- L448-L453: `cat -A` fails, the rest of the command still runs.
- L586-L592: screenshot search aborted by NOMATCH on one of three globs.
- L630: the agent reports the screenshot is not on disk (the search never actually listed anything).
- Cost: small in time, but a factual claim to the user built on a search that did not run.

```
L448 [CALL] Bash: sed -n 10,20p src/metabase/slackbot/uploads.clj | cat -A | cut -c1-140 | head -12; echo ---; sed -n 100,120p src/metabase/slackbot/uploads.clj; ...
L453 [RESULT] cat: illegal option -- A | usage: cat [-belnstuv] [file ...] | --- | ...
L586 [CALL] Bash: sed -n 300,368p src/metabase/slackbot/streaming.clj; echo ---; git diff --stat 6dfd18ce040 9e27498bbf6 -- src/metabase/metabot/agent src/metabase/metabot/self src/metabase/metabot/envelope.clj | tail -3; echo ---; ls -t ~/Desktop/*.png ~/Downloads/*.png ~/Pictures/Screenshots/*.png 2>/dev/null | head -5; command -v magick convert
L592 [RESULT] ... (eval):1: no matches found: ~/Pictures/Screenshots/*.png | /opt/homebrew/bin/magick | /opt/homebrew/bin/convert
```
