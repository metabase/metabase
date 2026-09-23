---
title: The Liquibase migration linter's strict spec allows one column per `addColumn` change but reports a two-column change only as a raw clojure.spec "Extra input" problem map buried among hundreds of "Validating ..." lines
slug: migration-linter-one-column-per-addcolumn-raw-spec-error
kind: misleading-signal
impact: wasted-time
severity: low
status: open
area: bin/lint-migrations-file.sh, bin/lint-migrations-file/src/change/strict.clj (:change.strict.add-column/columns), resources/migrations
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/ac37fe71-7046-48c1-885f-5bf5d9754c26.jsonl
    lines: 1658-1677
    date: 2026-09-10
    jev: {any_papercut: 0.85, env_toolchain: 0.90, stale_state: 0.26, verify_mismatch: 0.79, misleading_code: 0.40, hidden_coupling: 0.82, stale_docs: 0.34, tool_footgun: 0.60, flaky: 0.47, agent_bug: 0.93, wasted_effort: 0.66, user_correction: 0.07}
---
## Summary
A new migration added two columns in one `addColumn`. The linter printed one "Validating <file> ..." line per migration file, and the failure was a clojure.spec problems map (`:reason "Extra input"` at `[:changes 0 :addColumn :columns 1]`). `tail -5` showed only the rollback value, `head -30` only progress lines, a filtered grep only the spec header; the fourth run showed the path, and the agent split the change into two changeSets. The one-column rule is not written anywhere a developer would read it.

## Symptom
- L1659: `tail -5` shows the end of the offending value (`dropColumn` rollback entries).
- L1663: `head -30` shows the reflection warning and "Validating ..." lines.
- L1671: `:path [:changes :one-change :change :addColumn :columns], :reason "Extra input"` at `:in [:changes 0 :addColumn :columns 1]`.

## Timeline
- L1658-L1659: first run, tail only.
- L1662-L1663: head only, progress lines.
- L1666-L1667: filtered grep shows the spec name, not the reason.
- L1670-L1671: full problem map read.
- L1676-L1677: migration split into two changeSets, linter OK.
- Cost: 5 linter runs (each a Clojure startup plus a pass over every migration file).

## Root cause
`:change.strict.add-column/columns` is `(s/alt :column ::column)`, exactly one column, with no custom message; the linter prints the raw explain data. The README mentions "more than one change in a single changeSet" but not the one-column rule.

## Why agents fall for it
Liquibase itself accepts several columns per addColumn, and many existing migrations predate the strict spec; the error does not name the rule.

## Current state
Checked origin/master: strict.clj still defines columns as a single `s/alt`, and no doc under docs/developers-guide or the linter README mentions one column per addColumn.

## Suggested fix
- Attach a message to the strict addColumn spec ("one column per addColumn; use one changeSet per column") and print it instead of the raw problem map.
- Print only failing files, not a "Validating" line per migration.
- Add the rule to the linter README and the migrations section of the developers guide.

## Detection signal
`lint-migrations-file` output containing `:reason "Extra input"` with a path ending in `:addColumn :columns`.

## Raw excerpts
```
L1658 [CALL] Bash: cd ~/src/mb/wt/<branch> && ls bin/lint-migrations-file.sh 2>/dev/null; (./bin/lint-migrations-file.sh 2>&1 | tail -5) || ...
L1659 [RESULT] bin/lint-migrations-file.sh | [{:dropColumn {:tableName "ai_usage_log", :columnName "provider"}} | {:dropColumn | {:tableName "ai_usage_log", :columnName "model_name"}}]}, | :file "064/20260910_ai_usage_log_provider.yaml"}
L1663 [RESULT] Clearing outdated .cpcache directories if needed... | ... | Reflection warning, lint_migrations_file.cljc:358:11 - reference to field exists can't be resolved. | Check Liquibase migrations files... | Validating 001_update_migrations.yaml ... | ...
L1667 [RESULT] Validating 064/20260721_health_inspector_run_indexes.yaml ... | Error in 064/20260910_ai_usage_log_provider.yaml: Invalid change set. | :clojure.spec.alpha/spec :lint-migrations-file/changeSet, | :clojure.spec.alpha/value
L1671 [RESULT] Error in 064/20260910_ai_usage_log_provider.yaml: Invalid change set. | Details: | {:clojure.spec.alpha/problems | ({:path [:changes :one-change :change :addColumn :columns], | :reason "Extra input", | :pred (clojure.spec.alpha/alt :column :change.strict/column), ... :in [:changes 0 :addColumn :columns 1]}
L1677 [RESULT] Validating 064/20260901_field_data_sensitivity.yaml ... | Validating 064/20260910_ai_usage_log_provider.yaml ... | Ok.
```
