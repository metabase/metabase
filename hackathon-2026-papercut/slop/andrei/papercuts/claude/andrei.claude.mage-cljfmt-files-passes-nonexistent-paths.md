---
title: `./bin/mage cljfmt-files -c <path>` silently skips paths that do not exist and prints "All source files formatted correctly" with exit 0, so a typo'd or glued path turns the formatter gate into a false green
slug: mage-cljfmt-files-passes-nonexistent-paths
kind: misleading-signal
impact: wasted-time
severity: medium
status: open # origin/master mage/src/mage/format.clj still hands paths to cljfmt.tool unchecked
area: bb.edn `cljfmt-files` task, mage/src/mage/format.clj, cljfmt.tool/find-files
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/ea892f4f-4e3c-479f-b370-880a3afe35e8/subagents/agent-afc73a08506b2ede6.jsonl
    lines: 80-97
    date: 2026-09-03
    jev: {any_papercut: 0.89, env_toolchain: 0.92, stale_state: 0.32, verify_mismatch: 0.67, misleading_code: 0.41, hidden_coupling: 0.52, stale_docs: 0.37, tool_footgun: 0.82, flaky: 0.25, agent_bug: 0.82, wasted_effort: 0.70, user_correction: 0.07}
---
## Summary
A reviewer checked six changed files through one unquoted zsh variable, so kondo and cljfmt each got a single path containing spaces. Kondo reported "file does not exist"; cljfmt in check mode reported "All source files formatted correctly". mage never checks that its arguments exist, and cljfmt drops missing paths, so zero files checked reads as a pass. The reviewer only noticed because kondo's error sat in the same output.

## Symptom
L82: `#'cljfmt.tool/checking src/…/self.clj src/…/chat_completions.clj … test/…/self_test.clj...` (one space-joined string) followed by `All source files formatted correctly`, next to kondo's `…:0:0: error: file does not exist`.

## Timeline
- L80: `./bin/mage kondo $FILES` and `./bin/mage cljfmt-files -c $FILES` with an unsplit variable.
- L82: kondo errors, cljfmt passes.
- L93: agent realizes neither tool read a real file; L94 and L97 rerun with explicit paths (both clean).
- Cost: one rerun here; a cljfmt-only call would have been a silent false green on a CI gate.

## Root cause
`mage.format/files` prints "checking <paths>" and calls `cljfmt.tool/check {:paths file-paths}` with no existence check. In the pinned cljfmt, `find-files` is `(when (io/exists? f) …)`, so a missing path yields no files, and the summary for zero files is the normal success line with exit 0.

## Why agents fall for it
The success line echoes the path it was given, so it looks as if that path was checked; agents treat the formatter's green as final and do not compare file counts.

## Current state
origin/master mage/src/mage/format.clj `files`: prints `(str/join ", " file-paths)` then `(f {:paths file-paths})`; cljfmt gitlib 075eae26 tool.clj `find-files` returns nil when `(io/exists? f)` is false.

## Suggested fix
- In `mage.format/files`, fail listing any argument that does not exist, and print how many files were checked.
- Optionally exit non-zero when zero files were checked.

## Detection signal
`cljfmt.tool/checking` or `cljfmt.tool/fixing` followed by a single space-joined path, or cljfmt's success line in the same output as kondo's `file does not exist`.

## Raw excerpts
```
L80 [CALL Bash] cd ~/src/mb/wt/<branch> && FILES="src/metabase/metabot/self.clj src/metabase/metabot/self/openai/chat_completions.clj src/metabase/metabot/self/openrouter.clj test/metabase/metabot/self/openai/chat_completions_test.clj test/metabase/metabot/self/openrouter_test.clj test/metabase/metabot/self_test.clj"; … ./bin/mage cljfmt-files -c $FILES 2>&1 | tail -15; …
L82 [RESULT] … =====CLJFMT===== ⏎ #'cljfmt.tool/checking src/metabase/metabot/self.clj src/metabase/metabot/self/openai/chat_completions.clj src/metabase/metabot/self/openrouter.clj test/metabase/metabot/self/openai/chat_completions_test.clj test/metabase/metabot/self/openrouter_test.clj test/metabase/metabot/self_test.clj... ⏎ All source files formatted correctly ⏎ cljfmt exit:
L97 [RESULT] =====KONDO===== ⏎ Running Kondo on: [src/metabase/metabot/self.clj …] ⏎ linting took 590ms, errors: 0, warnings: 0 ⏎ =====CLJFMT===== ⏎ #'cljfmt.tool/checking src/metabase/metabot/self.clj, src/metabase/metabot/self/openai/chat_completions.clj, …
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/c9e08d36-c34d-4cc5-8d80-81c8c80b1f99.jsonl
  lines: 1372-1385
  date: 2026-09-11
  jev: {any_papercut: 0.88, env_toolchain: 0.89, stale_state: 0.34, verify_mismatch: 0.88, misleading_code: 0.18, hidden_coupling: 0.50, stale_docs: 0.29, tool_footgun: 0.78, flaky: 0.95, agent_bug: 0.84, wasted_effort: 0.38, user_correction: 0.35}

L1373: `#'cljfmt.tool/fixing src/…/client.clj src/…/uploads.clj … test/…/uploads_test.clj...` with no error, beside kondo's `error: file does not exist`.

- L1372: `mage cljfmt-files $F` and `mage kondo $F`.
- L1373: cljfmt silent, kondo errors.
- L1378-L1385: rerun with explicit paths; cljfmt prints the comma-separated file list it really processed.
- Cost: one rerun; saved only by kondo sharing the command.

```
L1373 [RESULT] === cljfmt === ⏎ #'cljfmt.tool/fixing src/metabase/slackbot/client.clj src/metabase/slackbot/uploads.clj src/metabase/slackbot/events.clj test/metabase/slackbot/client_test.clj test/metabase/slackbot/uploads_test.clj... ⏎ === kondo === ⏎ … test/metabase/slackbot/uploads_test.clj:0:0: error: file does not exist
L1385 [RESULT] === cljfmt === ⏎ #'cljfmt.tool/fixing src/metabase/slackbot/client.clj, src/metabase/slackbot/uploads.clj, src/metabase/slackbot/events.clj, test/metabase/slackbot/client_test.clj, test/metabase/slackbot/uploads_test.clj... ⏎ === kondo === ⏎ Running Kondo on: [src/metabase/slackbot/client.clj …]
```
