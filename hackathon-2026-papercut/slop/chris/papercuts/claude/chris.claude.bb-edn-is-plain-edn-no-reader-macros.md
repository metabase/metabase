---
title: bb.edn is read with the EDN reader, so `@var` in a task expression fails with an EdnReader stack trace, and `./bin/mage ... | tail` shows only JVM frames
slug: bb-edn-is-plain-edn-no-reader-macros
kind: tool-quirk
impact: wasted-time
severity: low
status: open
area: bb.edn (mage task definitions), bin/mage
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-nested-modules-infrastructure-master/42c11300-351a-4e89-a17d-1aaa63c2bfde.jsonl
    lines: 1109-1118
    date: 2026-08-30
    jev: {self_inflicted_bug: 0.92, tool_misuse: 0.97, misleading_signal: 0.49, user_correction: 0.24, codebase_trap: 0.83, flailing: 0.46, env_friction: 0.87}
---
## Summary
The agent added a mage task arg `(vec (sort @mage.modules/default-modules-which-trigger-drivers))` to `bb.edn`.
Every `./bin/mage` command then died while parsing bb.edn. `./bin/mage modules-validate 2>&1 | tail -8` showed
only `at babashka.main...` frames. Rerunning with `head -25` showed a babashka "version doesn't match, installing"
banner followed by `EdnReader$MapReader` frames, and the agent worked out that EDN has no `@`. The fix was
`(deref ...)`.

## Symptom
```
L1110 	at babashka.main.main(Unknown Source) ... (only stack frames under tail -8)
L1113 [WARNING] Could not determine installed Babashka version / Babashka not found or version doesn't match, installing...
      ... clojure.lang.EdnReader$MapReader.invoke(EdnReader.java:680)
L1116 [ASSISTANT] `bb.edn` is parsed with the EDN reader, which has no `@`. Using `deref` explicitly
```

## Root cause
bb.edn looks like Clojure (task bodies are code) but is loaded as EDN, so reader macros (`@`, `#()`, `'`) are
illegal. The failure also breaks `bin/mage`'s babashka version probe, which prints a misleading "not installed,
reinstalling" warning.

## Why agents fall for it
Task bodies in bb.edn are real Clojure forms. Agents write idiomatic Clojure there.

## Current state
`bb.edn:615` on master contains `@application-db-counter` only inside a string. No guard or doc note exists.

## Suggested fix
A comment header in bb.edn ("EDN: no reader macros — use (deref x), (fn ...), (quote x)"), and have `bin/mage`
print the EDN parse error message before any version-probe warnings.

## Detection signal
Edits to bb.edn containing `@`, `#(` or a leading `'`; mage output with `EdnReader` frames.
