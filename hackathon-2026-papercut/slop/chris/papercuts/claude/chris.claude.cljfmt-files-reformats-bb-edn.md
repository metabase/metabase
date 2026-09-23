---
title: "`./bin/mage cljfmt-files bb.edn` reindents unrelated comments, because master's bb.edn is not cljfmt-clean and CI's cljfmt-all never checks .edn"
slug: cljfmt-files-reformats-bb-edn
kind: codebase-trap
impact: wasted-time
severity: low
status: unknown
area: bb.edn, mage/src/mage/format.clj (cljfmt-files / cljfmt-all scope), .github/workflows/backend.yml be-cljfmt
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/48981bba-503a-49e5-a945-9a5c51572a3a.jsonl
    lines: 333-386
    date: 2026-09-14/15
    jev: {self_inflicted_bug: 0.87, tool_misuse: 0.81, misleading_signal: 0.60, user_correction: 0.75, codebase_trap: 0.69, flailing: 0.42, env_friction: 0.56}
---
## Summary
The agent added a `kondo-ratchets-report` task to `bb.edn` and ran `./bin/mage cljfmt-files` over its
changed files, including `bb.edn`. cljfmt reindented two unrelated comment lines in other tasks
(`;; note: no quoting -> expect it to be int`, `;; all, file, dir`) and more. The agent reverted
them by hand (L349-351). A `-c` check then still said "1 file(s) formatted incorrectly" (L357). A re-run
brought back more churn (L361). The agent looked at the CI config: `be-cljfmt` runs
`./bin/mage cljfmt-all --force-check`, and `mage/src/mage/format.clj` only considers
`.clj/.cljc/.cljs`. It concluded "CI runs `cljfmt-all`, which doesn't cover `.edn` (master's `bb.edn` already fails cljfmt)",
and finally did `git checkout bb.edn` and re-applied only the new block (L375-386).

## Symptom
```
L345 [RESULT] -                   ;; note: no quoting -> expect it to be int
+               ;; note: no quoting -> expect it to be int
L357 [RESULT] 1 file(s) formatted incorrectly
L375 [ASSISTANT] CI runs `cljfmt-all`, which doesn't cover `.edn` (master's `bb.edn` already fails cljfmt), so I'm dropping the formatter churn and keeping only the new task block.
```

## Root cause
`bb.edn` is a large hand-formatted EDN file that has never been held to cljfmt. The formatter accepts
explicit `.edn` paths, but CI never checks them, so the file drifted.

## Why agents fall for it
"Run the formatter on every file you touched" is good practice (the user's memory even says so). Here it
adds a diff unrelated to the change, against the "tight PR diffs" preference.

## Current state
Not re-verified in this drill (no formatter run). The agent's claim that master's bb.edn fails cljfmt is
from the transcript. Not documented anywhere.

## Suggested fix
Either cljfmt bb.edn once on master (and have CI check it), or make `cljfmt-files` skip `.edn` with a message.

## Detection signal
A cljfmt run over `bb.edn` that changes lines outside the hunk the agent edited.

## Raw excerpts
See Symptom; L371-372 `grep -rn 'cljfmt' .github/workflows/*.yml` → `backend.yml:476: run: ./bin/mage cljfmt-all --force-check`.
