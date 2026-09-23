---
title: Bash tool runs zsh on macOS: `echo ===` errors, unmatched globs abort commands, unquoted vars don't word-split, `$var:x` is a history modifier, BSD sed/cat/head flags fail -- often silently or as a misleading "0"
slug: zsh-and-bsd-shell-quirks
kind: env-friction
impact: both
severity: medium
status: open
merged_from: [zsh-shell-expansion-traps]
area: Claude Code Bash tool on macOS (zsh via shell snapshot), BSD coreutils
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/6da9d86f-a923-4553-b05f-b4e4e363b231.jsonl
    lines: 39-67, 94, 896, 1360
    date: 2026-09-02
    jev: {self_inflicted_bug: 0.64, tool_misuse: 0.80, misleading_signal: 0.64, user_correction: 0.79, codebase_trap: 0.82, flailing: 0.31, env_friction: 0.67}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-search-delete-00-memoize-model-hooks/bc72fc8d-5805-4236-9f38-c525a085b500.jsonl
    lines: 332-334, 561, 616-617, 1518-1523
    date: 2026-08-17 / 2026-09-17
    jev: {self_inflicted_bug: 0.85, tool_misuse: 0.89, misleading_signal: 0.63, user_correction: 0.44, codebase_trap: 0.61, flailing: 0.56, env_friction: 0.88}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/58ea02b2-4677-4a04-ac01-d6ef1c7624e4.jsonl
    lines: 154-166, 216-228, 254, 284-296
    date: 2026-09-16
    jev: {self_inflicted_bug: 0.86, tool_misuse: 0.93, misleading_signal: 0.64, user_correction: 0.70, codebase_trap: 0.53, flailing: 0.39, env_friction: 0.83}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/bc4e47b6-6b1e-4a41-84b4-440e15655cc0.jsonl
    lines: 837-844, 1075
    date: 2026-09-22
    jev: {self_inflicted_bug: 0.93, tool_misuse: 0.94, misleading_signal: 0.74, user_correction: 0.52, codebase_trap: 0.53, flailing: 0.71, env_friction: 0.97}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-uxw-4796-search-reindex-should-use-a-dedicated-lease-not-the-cluster/e3372045-21d0-4423-a7d8-a42d1960d9f7/subagents/agent-a866d6468d3e9ce14.jsonl
    lines: 26-27
    date: 2026-09
    jev: {self_inflicted_bug: 0.96, tool_misuse: 0.89, misleading_signal: 0.61, user_correction: 0.25, codebase_trap: 0.75, flailing: 0.44, env_friction: 0.85}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/cfa33e63-6d28-41e3-b4de-0fa2b9ca5cf1.jsonl
    lines: 788-789
    date: 2026-08-27
    jev: {self_inflicted_bug: 0.80, tool_misuse: 0.80, misleading_signal: 0.64, user_correction: 0.96, codebase_trap: 0.85, flailing: 0.39, env_friction: 0.83}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/40cd8c33-43d3-4e2e-8088-d99acee7a38f.jsonl
    lines: 355-365
    date: 2026-09-08
    jev: {self_inflicted_bug: 0.67, tool_misuse: 0.91, misleading_signal: 0.73, user_correction: 0.93, codebase_trap: 0.69, flailing: 0.38, env_friction: 0.82}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-module-resolver/7a939669-dffc-4b10-94a3-de8030e0b2d5.jsonl
    lines: 853-861
    date: 2026-09-10
    jev: {self_inflicted_bug: 0.97, tool_misuse: 0.89, misleading_signal: 0.82, user_correction: 0.11, codebase_trap: 0.56, flailing: 0.55, env_friction: 0.92}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/1212e408-9c8b-4bb3-b9cd-ae892dec51bf.jsonl
    lines: 489-509
    date: 2026-09-17 (approx)
    jev: {self_inflicted_bug: 0.22, tool_misuse: 0.94, misleading_signal: 0.77, user_correction: 0.95, codebase_trap: 0.46, flailing: 0.73, env_friction: 0.94}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-kondo-ratchets-merge-script/a0ba828b-731a-40b4-ac34-8be70d1da238.jsonl
    lines: 141-145, 439-440, 476-477, 874-875
    date: 2026-08-31
    jev: {self_inflicted_bug: 0.89, tool_misuse: 0.96, misleading_signal: 0.51, user_correction: 0.79, codebase_trap: 0.69, flailing: 0.46, env_friction: 0.76}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/26fde2ad-8bfb-4ad4-87bf-7b539ddf6e82.jsonl
    lines: 86-92
    date: unknown
    jev: {self_inflicted_bug: 0.96, tool_misuse: 0.84, misleading_signal: 0.49, user_correction: 0.64, codebase_trap: 0.81, flailing: 0.33, env_friction: 0.77}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-78704-copy-transform-models/9201d948-0009-4073-b8a4-a56cab4824a2.jsonl
    lines: 374-379
    date: 2026-09-10
    jev: {self_inflicted_bug: 0.89, tool_misuse: 0.95, misleading_signal: 0.71, user_correction: 0.62, codebase_trap: 0.35, flailing: 0.27, env_friction: 0.90}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-uxw-4796-preliminary-cleanups/584db19f-a406-43a1-b9f1-5db9a68c5e28.jsonl
    lines: 76-80, 434-438, 517-518, 615-619, 1149-1153, 1166-1189, 1252, 2191, 2728-2730
    date: 2026-09-07..09
    jev: {self_inflicted_bug: 0.90, tool_misuse: 0.91, misleading_signal: 0.62, user_correction: 0.92, codebase_trap: 0.74, flailing: 0.52, env_friction: 0.85}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-evals-bot-2165-expand-provider-matrix/253f6689-2454-43e0-b1df-dece373b153a.jsonl
    lines: 2707-2713
    date: 2026-09 (after Sep 17)
    jev: {self_inflicted_bug: 0.40, tool_misuse: 0.94, misleading_signal: 0.76, user_correction: 0.94, codebase_trap: 0.64, flailing: 0.36, env_friction: 0.72}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-uxw-4796-preliminary-cleanups/72ee4b52-4213-4328-b91b-df0671210015.jsonl
    lines: 250-251
    date: ~2026-09-17
    jev: {self_inflicted_bug: 0.80, tool_misuse: 0.80, misleading_signal: 0.62, user_correction: 0.75, codebase_trap: 0.39, flailing: 0.43, env_friction: 0.95}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/025e8586-a280-4a50-ae6c-ed98e5b728af.jsonl
    lines: 427-428
    date: 2026-09-20
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-boost-metabot-library-selection/1dece064-f6c3-42cc-b09d-dc78ef3603ff.jsonl
    lines: 642-648
    date: ~2026-09-16
  - transcript: (papercut-drill agent, no transcript recorded)
    lines: n/a
    date: 2026-09-23
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-stats-remote-sync/6fdcc6ed-191e-460e-8ffe-523a794c6ac7.jsonl
    lines: 277-288 (BSD sed `\b`), 807-808 (NOMATCH), 920-932 (no word splitting)
    date: 2026-09-02
    jev: {self_inflicted_bug: 0.68, tool_misuse: 0.91, misleading_signal: 0.73, user_correction: 0.60, codebase_trap: 0.79, flailing: 0.51, env_friction: 0.83}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-boost-metabot-library-selection/83b14905-733c-4844-8ea9-7f3fb00a3cb9.jsonl
    lines: 326-331
    date: 2026-09-16
    jev: {self_inflicted_bug: 0.96, tool_misuse: 0.81, misleading_signal: 0.63, user_correction: 0.43, codebase_trap: 0.75, flailing: 0.46, env_friction: 0.91}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-dynamic-require-lints/e6b23baa-5f60-44a8-8556-c6dc922330e9.jsonl
    lines: 98-106 (BSD du), 133-134 (BSD cat -A)
    date: 2026-09-01
    jev: {self_inflicted_bug: 0.27, tool_misuse: 0.97, misleading_signal: 0.93, user_correction: 0.63, codebase_trap: 0.52, flailing: 0.76, env_friction: 0.95}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-pr-03-llm-config/93bd1b32-5bde-4582-9d8a-53740b3387ef.jsonl
    lines: 1243-1245, 1494-1506, 2983, 3444-3467
    date: 2026-08-29/30
    jev: {self_inflicted_bug: 0.97, tool_misuse: 0.74, misleading_signal: 0.56, user_correction: 0.26, codebase_trap: 0.87, flailing: 0.35, env_friction: 0.93}  # chunk 5 (1579-1880)
    jev_chunk_11: {self_inflicted_bug: 0.87, tool_misuse: 0.96, misleading_signal: 0.92, user_correction: 0.35, codebase_trap: 0.80, flailing: 0.47, env_friction: 0.85}  # chunk 11 (3334-3682)
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-review-bot-1997/ef637b05-28bd-40e5-a402-79a3e8b7d142.jsonl
    lines: 81-132
    date: 2026-09 (PR #80083 updatedAt 2026-09-10)
    jev: {self_inflicted_bug: 0.72, tool_misuse: 0.97, misleading_signal: 0.78, user_correction: 0.05, codebase_trap: 0.73, flailing: 0.77, env_friction: 0.93}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-kondo-ratchets/4ba7971f-77cc-4c62-a6c2-b426f0be4c37.jsonl
    lines: 520-530
    date: 2026-08-26
    jev: {self_inflicted_bug: 0.31, tool_misuse: 0.82, misleading_signal: 0.74, user_correction: 0.96, codebase_trap: 0.76, flailing: 0.33, env_friction: 0.85}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-80394-metabot-tennant/b31b1fd7-7c96-47c9-95ad-9bfbd57f1c09.jsonl  # deleted; reconstructed from redacted chunks
    lines: 131-132, 160-161, 193-194
    date: 2026-08-21
    jev: {self_inflicted_bug: 0.75, tool_misuse: 0.89, misleading_signal: 0.68, user_correction: 0.82, codebase_trap: 0.68, flailing: 0.46, env_friction: 0.85}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-80394-metabot-tennant/b31b1fd7-7c96-47c9-95ad-9bfbd57f1c09/subagents/agent-a7577c63a1ab88d51.jsonl  # deleted; reconstructed from redacted chunks
    lines: 9, 13
    date: 2026-08-21
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-80394-metabot-tennant/b31b1fd7-7c96-47c9-95ad-9bfbd57f1c09/subagents/agent-a4d2f969a8f51a83f.jsonl  # deleted; reconstructed from redacted chunks
    lines: various (4 nomatch hits)
    date: 2026-08-21
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-80394-metabot-tennant/b31b1fd7-7c96-47c9-95ad-9bfbd57f1c09/subagents/agent-a593840a18025e091.jsonl  # deleted; reconstructed from redacted chunks
    lines: various (2 nomatch hits)
    date: 2026-08-21
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-80394-metabot-tennant/b31b1fd7-7c96-47c9-95ad-9bfbd57f1c09/subagents/agent-a939484eb0ad2e185.jsonl  # deleted; reconstructed from redacted chunks
    lines: 9, 20
    date: 2026-08-21
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-80394-metabot-tennant/b31b1fd7-7c96-47c9-95ad-9bfbd57f1c09/subagents/agent-adddffa8492105f9b.jsonl  # deleted; reconstructed from redacted chunks
    lines: 6
    date: 2026-08-21
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-80394-metabot-tennant/b31b1fd7-7c96-47c9-95ad-9bfbd57f1c09/subagents/agent-a78c6410c75364840.jsonl  # deleted; reconstructed from redacted chunks
    lines: 25
    date: 2026-08-21
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-80394-metabot-tennant/b31b1fd7-7c96-47c9-95ad-9bfbd57f1c09/subagents/agent-aee7cc11cc58331de.jsonl  # deleted; reconstructed from redacted chunks
    lines: 74
    date: 2026-08-21
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-80394-metabot-tennant/f6535e97-e0e1-4040-958e-3a5295bd2b0f.jsonl  # deleted; reconstructed from redacted chunks
    lines: 73-74, 612-613
    date: 2026-08-21
    jev: {self_inflicted_bug: 0.97, tool_misuse: 0.93, misleading_signal: 0.41, user_correction: 0.87, codebase_trap: 0.83, flailing: 0.36, env_friction: 0.76}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-app-db-rollback-only/06df2484-9228-4af0-b0fa-7fd49354a8f3.jsonl
    lines: 813-856
    date: 2026-08-25
    jev: {self_inflicted_bug: 0.19, tool_misuse: 0.81, misleading_signal: 0.87, user_correction: 0.91, codebase_trap: 0.36, flailing: 0.73, env_friction: 0.78}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-app-db-rollback-only/a4d08ba6-bcae-4d25-a47f-150cf6e80cfc.jsonl
    lines: 95-96
    date: 2026-08-21
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-app-db-rollback-only/a4d08ba6-bcae-4d25-a47f-150cf6e80cfc/subagents/agent-a60c5f8ae48a8cd91.jsonl
    lines: 1383
    date: 2026-08-24
---
## Summary
The Bash tool executes commands through the user's zsh (`/bin/zsh -c source ~/.claude/shell-snapshots/snapshot-zsh-...`) on macOS with BSD userland. Agents write bash/GNU idioms. Across every session in this batch the same handful of differences cost a round trip each, and several produce *wrong-but-plausible* output rather than an error:

| Idiom | zsh/BSD behaviour | Seen |
|---|---|---|
| `echo "=== x ==="` works, but `echo ===` or `echo =====` unquoted | zsh `=cmd` expansion: `(eval):1: == not found`, whole command exits 1, following commands in the `;` list still run but output is truncated | 6da9d86f L40, L95; bc72fc8d L333, L617; 58ea02b2 L254; 72ee4b52 L250; b31b1fd7 L132 and subagents a7577 L13, a9394 L9/L20, adddf L6 |
| `grep -rn ... --include=*.md` (unquoted glob) | `no matches found: --include=*.md`, command never runs | 6da9d86f L64; 58ea02b2 L228; cfa33e63 L789; a0ba828b L439; 26fde2ad L86; 584db19f L77, L518; 83b14905 L326; 93bd1b32 L1494, L2983; a4d08ba6 L95; b31b1fd7 L161, L194 and 5 of its subagents; f6535e97 L74 |
| `grep -rln ... --include=*.clj \| wc -l` | glob error on stderr, **`wc -l` prints 0** -> agent reads "0 files use this" | subagent a866 L27 (`with-new-search-if-available` count 0) |
| `for spec in "light 1200,2400"; do set -- $spec`, `FILES="a b"; cmd $FILES` | zsh does not word-split unquoted `$spec`; all three Chrome screenshots came out identical; a pathspec matched nothing and read as "master never touched these files" | 58ea02b2 L154-164; 1212e408 L489; 584db19f L434; 253f6689 L2711; 6fdcc6ed L920; ef637b05 L85; 93bd1b32 L1500 |
| `git show $rev:path/...` (unbraced var before `:`) | zsh history modifiers (`:e`, `:t`, `:s`, `:h`, `:r`) mangle the revision, often with exit 0 or with stderr discarded; loops report files as ABSENT/LOST | 40cd8c33 L359; 7a939669 L853; 584db19f L1149-1188; 06df2484 L816-856 |
| `sed -i '' 's/foo\b/...'` | BSD sed has no `\b`; silent no-op, lint still failing | bc72fc8d L1518-1523 ("macOS `sed` doesn't understand `\b`; using perl instead"); 6fdcc6ed L277; 93bd1b32 L1233 |
| `sed -e '$ { /^$/d }'` | BSD sed: "extra characters at the end of d command" | f6535e97 L613 |
| `cat -A` | `cat: illegal option -- A` | 6da9d86f L1360; bc4e47b6 L1075; a0ba828b L141; 025e8586 L427; 1dece064 L642; e6b23baa L133 |
| `head -0`, `head -c0` | `illegal line count -- 0` | 58ea02b2 L216-222, L285; bc72fc8d L561 |
| `sort` on binary-ish `head -1` of files; `sed` on non-ASCII | `sort: Illegal byte sequence`, `sed: RE error: illegal byte sequence` (LC_ALL) | bc4e47b6 L844; 9201d948 L374 |
| `ls .clj-kondo/hooks/.../x*.clj*` with no match | `no matches found`, loop body skipped | cfa33e63 L789; a0ba828b L476, L874; b31b1fd7 subagents (`resources/migrations/06*.yaml` etc.) |
| `cmd \| tail -3 \|\| fallback` | pipe exit status is tail's, fallback never runs | 6da9d86f L314 (`./bin/mage kondo-ratchet-tests` nonexistent task; listing printed, fallback skipped); 6fdcc6ed L807 |

A separate, higher-severity zsh trap is kept in its own file: a loop variable named `path` is tied to `$PATH`, so `while read -r path` clobbers it and later commands in the loop are "not found". See `chris.claude.zsh-path-variable-clobbers-path.md`.

## Symptom
Error lines like `(eval):1: == not found`, `(eval):1: no matches found: --include=*.md`, `(eval):1: bad substitution`, `fatal: ambiguous argument '...'`; or silently wrong results (count 0, identical screenshots, sed no-op, every loop row "ABSENT"/"LOST"/"identical").

## Timeline (representative)
- 6da9d86f L39-40: `wc -l ...; echo ===; grep -n ...` -> `(eval):1: == not found`, the grep never ran; agent re-ran without it.
- 6da9d86f L63-67: `--include=*.md` -> "no matches found" twice; agent quoted it on retry.
- subagent a866 L26-27: `grep -rln "with-new-search-if-available\|search.tu/" test enterprise/backend/test --include=*.clj | wc -l` -> `(eval):2: no matches found: --include=*.clj` then `0`. The agent moved on; the 0 was never corrected in that step.
- 58ea02b2 L160-164: three screenshot files with identical size 69261; "The shell didn't split the arguments, so all three screenshots came out identical."
- bc72fc8d L1518-1523: sed `\b` rename silently did nothing; kondo warning persisted; switched to perl.

### `$var:modifier` and other hits (batch b9, 2026-08-31..09-17)
(Merged earlier from the parallel duplicate `zsh-var-colon-modifiers-glob-nomatch-no-wordsplit`.)
- **`$VAR:e` modifier, silent wrong result** (40cd8c33 L359-363). A completeness check after rebasing someone's
  branch ran `git -C $main rev-parse $H:enterprise/backend/src/metabase_enterprise/mfa/init.clj`. zsh applied
  the `:e` (extension) modifier and printed `rebased   : nterprise/backend/src/metabase_enterprise/mfa/init.clj`,
  with exit 0. The paired `git diff` also errored ("unknown revision or path"). The agent: "The earlier bulk
  diff silently failed. Let me redo the completeness check properly." That check was guarding a real content
  loss (see `git-rebase-drops-merge-commit-resolutions`), so a silent mis-expansion here could have shipped it.
- **`$B:src` -> bad substitution** (7a939669 L853-854): `git show $B:src/metabase/util/log.clj > ...` ->
  `(eval):1: bad substitution`; fixed at L861 with `"${B}:src/..."`.
- **No word splitting** (1212e408 L489-490): `FILES="src/... src/..."; git -C $SCRATCH checkout c4e11a9b515 -- $FILES`
  -> `pathspec 'src/metabase/metabot/self/adapter.clj src/... test/metabase/metabot/self/adapter_test.clj' did
  not match any file(s) known to git`. Redone with a literal backslash-continued list at L503.
- **nomatch on `--include=*.clj`** (a0ba828b L439-440, 26fde2ad L86-87): `(eval):1: no matches found: --include=*.clj`.
  Also a0ba828b L476 (`ls jest.*.js jest.*.ts` -> `no matches found: jest.*.ts`) and L874-875
  (`ls node_modules/js-yaml/*.d.ts ... || echo "no bundled .d.ts"` -> `(eval):1: no matches found`, read
  as a finding).
- **BSD `cat -A`** (a0ba828b L141-142): `cat: illegal option -- A`; the agent switched to a sed trick.
- **BSD sed + non-ASCII** (9201d948 L374-375): stripping ANSI codes from ci-retry output
  (`... | cat -v | sed 's/\^\[\[[0-9]*m//g'`) -> `sed: RE error: illegal byte sequence`; fixed with
  `LC_ALL=C` and `$'s/\033\\[[0-9;]*m//g'`.
- That drill itself: `echo =====` -> `(eval):1: ===== not found`.

### A false audit result reported to the user (batch b0, 584db19f, 2026-09-07..09)
(The BSD `head -n -1` half of this session is in `chris.claude.bsd-tools-silent-failure-commits-conflict-markers.md`, because there the failure led to committed conflict markers.)

The user asked "are you sure nothing was lost or mangled or regressed in your merge conflicts?" (L1116).
The agent's audit loop used git's `rev:path` syntax with an unbraced variable, `git show $r:test/...` and
`git show $OLD_BASE:src/...`. zsh read `:t` and `:s` as history modifiers on the variable. That mangled the
revision, git errored with stderr discarded, and the loop reported whole deftests and many lines as `LOST`
when they were present in both trees. The agent caught the contradiction only because a later `git grep`
found the deftest in both tips.

```
L1149 OLD_BASE=$(git merge-base 9d9b45ce739 master)
      git show $OLD_BASE:src/metabase/search/models/search_index_metadata.clj | grep -n "query-one\|t2/query"
L1150 fatal: ambiguous argument '1e78c186c0c2884c19c10af3f675b7f1eafaea89ch_index_metadata.clj': unknown revision or path not in the working tree.
L1166 for r in 9d9b45ce739 ...; do c=$(git show $r:test/metabase/search/appdb/index_test.clj | grep -c "failed-pending-upsert-...")
L1167 fatal: ambiguous argument '9d9b45ce739est/metabase/search/appdb/index_test.clj' ...
      566ebf9b934 uxw-4796-reindex-freshness-gauge: deftest=0 lines=       0
L1188 [ASSISTANT] The check itself was unreliable — let me redo it with quoting that zsh can't mangle.
L1252 [ASSISTANT] (My first pass at the check was itself broken: zsh ate `$rev:test/...` as a `:t` modifier, so it reported a whole deftest as lost that was present in both trees.)
```

Other hits in the same session:
- L77, L518: `grep -rn ... --include=*.clj src/` → `(eval):2: no matches found: --include=*.clj`.
- L434-435: `clj-kondo --lint $FILES` passed one space-joined argument → `... :0:0: error: file does not exist`. The fix was `xargs`.
- L616, L2191: `for f in ... table-exists? ...` → `(eval):2: no matches found: table-exists?`. After this the agent began adding `set -f` to loops.
- L2728: `git grep -c "/$v\b"` returned 0 for every var, because git grep's default regex has no `\b`. The agent said: "That check was broken — `\b` isn't supported there, so everything read as zero."

evals session 253f6689: `for p in "154 615ef0c" ...; do set -- $p; ...` did not split, so the loop gave `no pull requests found for branch "154 615ef0c"` and printed "identical tree" on every row. L2711: "That comparison didn't run: zsh doesn't split variables into words, so the "identical tree" lines are meaningless."

### `$r:e2e` read as "extension of $r", then misdiagnosed (06df2484, 2026-08-25)
(Merged from the duplicate `zsh-shell-expansion-traps`.)

The `:e` (extension) modifier this time, on the same `git show $r:path` idiom. Checking how far back two e2e specs
exist across release branches, the agent wrote `r=origin/release-x.$b.x; ... git show $r:e2e/test/scenarios/...`.
zsh parses `$r:e` as "extension of $r" = `x`, so the object became `x2e/test/scenarios/...`. With `2>/dev/null`, every
branch reported "spec ABSENT" / `lines=0` / `view_count=0` (L816, L822, L832, L834) -- a false answer to the user's
question "are you sure they both apply to older versions? how far back?".

Verified: `zsh -c 'r=origin/release-x.61.x; echo "$r:e2e/test"'` prints `x2e/test`.

The agent noticed only because it had read line 575 of the v61 spec earlier (L820 "That result is wrong"), then
**misdiagnosed** the cause: L829 "My loop was broken (`LC_ALL=C` + the local `ugrep` alias miscounting)". It dropped
`LC_ALL=C` but kept `$r:e2e` (L830-834, still all zeros), and only got correct numbers when it inlined
`origin/release-x.$b.x:e2e/...` without the variable (L848-856). The wrong diagnosis ("ugrep alias") could become a
false memory. Correct fix: `${r}:path`.

```
L821 [TOOL Bash] ... for b in 58 59 60 61 62 63; do r=origin/release-x.$b.x; echo -n "v$b tabs.cy.spec.js: "; git show $r:e2e/test/scenarios/dashboard/tabs.cy.spec.js 2>/dev/null | LC_ALL=C grep -c 'view_count' || echo "ABSENT"; done
L822 [RESULT] v58 tabs.cy.spec.js: 0
ABSENT
...
L824 [TOOL Bash] ... git show origin/release-x.61.x:e2e/test/scenarios/dashboard/tabs.cy.spec.js | wc -l; ... | grep -c view_count
L825 [RESULT]      848  --- grep view_count: 16
L829 [ASSISTANT] My loop was broken (`LC_ALL=C` + the local `ugrep` alias miscounting). Redoing it properly:
L832 [RESULT] v57: lines=0 view_count=0 ... v63: lines=0 view_count=0
L849 [RESULT] v59 tabs: 16  v60 tabs: 16  v61 tabs: 16  v62 tabs: 16  v63 tabs: 12
```

Also `nomatch` again in the same worktree: `grep -rn ... --include=*.clj .` -> `(eval):1: no matches found: --include=*.clj` in a4d08ba6 L95-96 (2026-08-21) and its subagent agent-a60c5f8ae48a8cd91 L1383 (2026-08-24).

### `echo ===` and `cat -A` (2026-09-16..23)
- 72ee4b52 L250-251: reading three memory files: `sed -n '1,40p' $M/a.md; echo ====; sed -n ... b.md; echo ====; ...` printed the first file, then `(eval):1: === not found`, and the command exited 1 (tool result shown as an ERROR). The second and third memory files were never printed.
- 025e8586 L427-428: `sed -n '2383,2386p' .clj-kondo/config/modules/config.edn | cat -A` -> `cat: illegal option -- A`. The agent had used `cat -A` to find invisible characters. It then ran a `perl -i` substitution on line 2384 that missed (the target was line 2385, L433-446), which cost two more round trips.
- 1dece064 L642-648: `... | cat -A | sed -n 12,19p` -> `cat: illegal option -- A / usage: cat [-belnstuv]`; the retry used `cat -v`.
- Also hit by the papercut-drill agent itself on 2026-09-23 with an unquoted `echo ===` in a `;` list: `(eval):1: == not found`, exit 1, and the output after it was lost.

### Batch b4 (2026-09-01..16)
1. **BSD sed `\b` silently no-ops (6fdcc6ed L277-288).** When porting view SQL into data-stack DDL, `sed 's/\bevals\./{database}./g'` left every inner `FROM evals.case_result` unchanged. The generated file was written, and only a follow-up `grep` showed the stale references. "`\b` isn't supported by BSD sed — the inner references didn't convert." The agent redid it in Python. Unnoticed, the DDL would have read from the wrong database (`evals` instead of `raw_evals`) in prod.
2. **NOMATCH aborts part of a compound command (6fdcc6ed L807-808).** `grep -rl ... golden*/ ...` → `(eval):7: no matches found: golden*/`. In the same command, `git checkout -q codex/clickhouse-analytics-contract 2>&1 | tail -2` failed (branch held by another worktree), and the `| tail` swallowed the exit status. The next step ran the "patched" test on **main** and printed a false "BUG: wrong-order ranking graded as PASS" under the heading "=== on #113 branch (patched) ===". The agent noticed at L811.
3. **No word splitting (6fdcc6ed L920-932).** `for spec in "metabase/data-stack 110" "metabase/evals 113"; do set -- $spec; REPO=$1; N=$2` → `$1` was the whole string, so `gh pr view "" --repo "metabase/data-stack 110"` failed, the JSON decode raised a traceback, and `gh api repos/$REPO/pulls/$N/comments` returned 404. "zsh doesn't word-split unquoted expansions — my `set --` didn't split."
4. **Unquoted `--include=*.selmer` (83b14905 L326-327).** `grep -rn ... resources/metabot/prompts --include=*.selmer --include=*.md` → `(eval):1: no matches found: --include=*.selmer`, so the whole grep was skipped. (The drill agent hit the same thing on `--include=*.clj` while checking the current tree for this batch.)
5. **BSD `du` / `cat` flags (e6b23baa L98-106, L133-134).** `du -sh -d 1` → usage error, hidden by `2>/dev/null` so it printed "(Bash completed with no output)". `cat -A` → `cat: illegal option -- A`.

### pr-03-llm-config, review-bot-1997, kondo-ratchets (2026-08-26..09-10)
93bd1b32 (pr-03-llm-config):
- L1233-1243: `sed -i '' 's/\bprovider-and-model\b/model-ref/g'` is a silent no-op on BSD sed (no `\b`). The agent saw stale names in the output and switched to `perl -pi`.
- L1494 / L2983: `grep -rl ... --include=*.edn` / `--include=*.clj` → `(eval):3: no matches found: --include=*.edn` (zsh nomatch on the unquoted glob). The command aborts; the next command still runs.
- L1500-1506: `FILES=$(grep -rl ...); perl -pi -e ... $FILES` → `Can't open enterprise/.../benchmark_test.clj\nenterprise/...` (one argument with embedded newlines). The follow-up `grep -c ... $FILES | grep -v ':0' | wc -l` printed `0 files`, which read as success.
- L3444-3467: `roborev close $IDS` (newline-joined) → `Error: invalid job_id: 4606\n4607...`; see `roborev-close-single-id-and-canceled-jobs`.

ef637b05 (review-bot-1997):
- **Wrong conclusion, not just a retry.** L85: `FILES="src/... src/... test/..."; git log --oneline c78c9fed48b..origin/master -- $FILES | wc -l` → `0`. L95 ASSISTANT: "Master never touched the PR's files, so the incremental diff is clean. Let me build a synthetic two-commit branch". The whole space-separated string was a single pathspec that matched nothing. L99-100 the same variable broke `git add -A $FILES` (`fatal: pathspec '...' did not match any files`). L120: "The earlier 'master didn't touch these files' check was wrong — zsh didn't split the variable." Redone with `$(tr '\n' ' ' < file)`: **10 master commits** touched those files, including `auth-check transform source (#80328)`, which overlapped the PR directly and turned out central to the review (the PR's transform gate was dead code under master's check, L268-312).

4ba7971f (kondo-ratchets):
- `comm` over one list from `python ... sorted()` and one from `psql ... ORDER BY` (collation-sorted). L528: "My `comm` check was unsound — the two lists were sorted under different collations." Redone with `LC_ALL=C sort` on both sides. `comm` gives no warning about unsorted input on macOS by default.

Batch-3 note: that session's drill agent also hit zsh nomatch itself while verifying (`grep -rn ... --include=*.clj` → `no matches found`), which shows how reflexive the idiom is.

### One /code-review fan-out, a dozen hits (80394-metabot-tennant, 2026-08-21)
(Transcripts b31b1fd7, its subagents, and f6535e97 are deleted; reconstructed from redacted chunks.)

Across one /code-review fan-out (the main agent plus 7 of 10 subagents), the same two zsh traps appeared over a dozen times:
- `grep -rn ... --include=*.clj` / `--include=*.ts` / `--include=*.tsx` -> `(eval):1: no matches found: --include=*.clj`. It aborts the whole
  command, including other commands chained with `;`. Seen in main b31 L161, L194; subagents a7577 L9, a4d2f (4x), a5938 (2x), a9394, f6535e97 L74.
  Also unmatched path globs: `resources/migrations/06*.yaml`, `resources/migrations/05*/*.yaml`, `resources/migrations/064/20260821*`,
  `frontend/src/metabase/lib/groups.ts*`, `bin/lint-migrations-file/src/change_set/*.cljc`.
- `echo ====` / `echo =====` / `echo ===PAGE` -> `(eval):1: ==== not found` (zsh `=cmd` expansion). Main b31 L132 (`=== not found`) and
  subagents a7577 L13, a9394 L9 and L20, adddf L6. This turns the whole compound command into exit 1 (`RESULT ERROR`).
- BSD sed, f6535e97 L613: `sed -e '$ { /^$/d }'` -> "extra characters at the end of d command".
Each hit cost a re-run. The subagents rediscovered the problem independently because nothing in the finder prompts warns about it.
(The source listed subagents a78c6 L25 and aee7c L74 among the transcripts without saying which trap they hit.)

## Root cause
Model priors are bash + GNU coreutils; the host is zsh + BSD. zsh's `EQUALS` option (`=word` -> path of command), `NOMATCH` (unmatched glob is an error), no `SH_WORD_SPLIT`, and csh-style history modifiers on unbraced parameters (`$r:e`, `$r:t`, `$r:s`) differ from bash.

## Why agents fall for it
The Bash tool is named "Bash". Output separators like `echo ===` are a habit, and `git show $rev:path` is idiomatic in bash. Errors appear mid-output and the rest of the `;` chain still prints, and `2>/dev/null` hides the rest, so the failure is easy to miss. When the agent does notice, it can misattribute the cause (06df2484 blamed `LC_ALL=C` and a `ugrep` alias). Parallel subagents each rediscover the same traps because nothing in their prompts warns about them.

## Current state
Open. No global CLAUDE.md note about zsh/BSD. (The harness system prompt does mention BSD vs GNU sed flags in passing.)

## Suggested fix
- Global CLAUDE.md "Shell" section: "The Bash tool runs zsh on macOS with BSD tools. Quote globs in flags (`--include='*.clj'`), quote `===` separators, don't rely on word splitting of unquoted vars, brace variables before a colon (`"${rev}:path"`), use `perl -pi` instead of `sed -i` for regex edits, no `cat -A`/`head -0`; `set -o pipefail` if you rely on `||` after a pipe."
- Or: configure the tool's shell with `setopt no_nomatch no_equals sh_word_split` in the snapshot.

## Detection signal
- Regex over tool results: `\(eval\):\d+: (no matches found|bad substitution|.* not found)`, `illegal option`, `illegal line count`, `Illegal byte sequence`, `extra characters at the end of`. A `| wc -l` result of 0 immediately after a `no matches found` line is a high-confidence misleading-signal flag.
- Pre-execution lint: flag an unbraced `\$[A-Za-z_][A-Za-z0-9_]*:[a-zA-Z]` in any command, as in `git show $rev:path`, since the `:e`/`:h`/`:t`/`:r`/`:s` modifiers give exit 0 or a discarded error with a wrong path. The fix is `"${rev}:path"`.
- Flag results where every item in a loop has the same count, such as all 0, all LOST, all ABSENT, or all "identical".

## Raw excerpts
```
6da9d86f L39 wc -l dev/test/... ; echo ===; grep -n "slack\|over-budget..." ...
L40 [RESULT ERROR] Exit code 1 ... (eval):1: == not found
a866 L26 ... grep -rln "with-new-search-if-available\|search.tu/" test enterprise/backend/test --include=*.clj | wc -l; ...
L27 (eval):2: no matches found: --include=*.clj
       0
58ea02b2 L160 -rw-r--r--@ 1 christruter  wheel  69261 Sep 16 21:34 shot-dark 1200,1200.png
              -rw-r--r--@ 1 christruter  wheel  69261 Sep 16 21:34 shot-light 1200,2400.png
              -rw-r--r--@ 1 christruter  wheel  69261 Sep 16 21:34 shot-mobile 400,2400.png
bc4e47b6 L1076 cat: illegal option -- A
```
(More excerpts under each Timeline subsection.)
