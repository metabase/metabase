---
title: Kondo ratchet scanner walked gitignored build output (modules/drivers/*/target), producing phantom over-budget failures locally
slug: kondo-ratchet-scanner-counts-gitignored-files
kind: misleading-signal
impact: wasted-time
severity: medium
status: documented-still-hit  # scan still walks the filesystem: dev/src/dev/kondo_ratchet.clj:459-467 (file-seq over source-roots :284-285), called from mage/src/mage/kondo_ratchet.clj:502 and dev/src/dev/kondo_ratchet.clj:916,998; git ls-files (:198-214) feeds only repository-linters (:228-239)
area: dev/src/dev/kondo_ratchet.clj (scan / source-roots), mage kondo-ratchets, project-tests ratchets
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/6da9d86f-a923-4553-b05f-b4e4e363b231.jsonl
    lines: 208-336
    date: 2026-09-02
    jev: {self_inflicted_bug: 0.64, tool_misuse: 0.80, misleading_signal: 0.64, user_correction: 0.79, codebase_trap: 0.82, flailing: 0.31, env_friction: 0.67}
---
## Summary
The ratchet scanner's `source-roots` were `["src" "test" "enterprise" "modules/drivers" "dev" "bin" "mage"]`, walked on the filesystem without honouring `.gitignore`. In a long-lived worktree, `modules/drivers/*/target/jar/...` (copies of driver sources inside built jars) contain `:clj-kondo/ignore` forms, so the ratchet check reported phantom over-budget linters and a hard parse error, while a clean checkout and CI were green. Documented in memory before this session and still hit. Not fixed: `git ls-files` is used only for the `.clj-kondo` config dir; the inline-ignore `scan` still walks the filesystem (see Current state).

## Symptom
```
L209 [RESULT] ... expected: {}
  actual: {:all {:actual 2, :examples ["modules/drivers/druid/target/jar/metabase/driver/druid/query_processor.clj:688" ...
L227 FAIL in metabase.core.kondo-ratchet-test/ignores-are-justified-test ... modules/drivers/snowflake/target/jar/metabase/driver/snowflake.clj
     ERROR ... Unsupported :clj-kondo/ignore syntax on lines 104, 121; use the literal ignore key first in its map in modules/drivers/mongo/target/jar/metabase/driver/mongo/connection.clj
L268 `./bin/mage check-kondo-ratchets` prints the same mongo target error, exit=0
```

## Timeline
- L208 agent runs `./bin/mage project-tests ratchets` after its change: failures.
- L218-223 agent confirms the paths are gitignored (`.gitignore:77:/modules/drivers/*/target`) and that 15 driver target dirs exist.
- L230-241 agent creates a throwaway clean worktree, copies its edited files in, re-runs: 55 tests green. It repeated this clean-worktree dance at L271, L314, L562, L611 for every verification.
- L336 final report: "A local run in your working copy still fails, on three phantom findings from gitignored `modules/drivers/*/target/jar/` build output that `source-roots` walks ... the known scanner-vs-.gitignore gap."
- L740 agent updates memory `reference_kondo_ratchet_fixer_ignores_gitignore.md` with the new task names.

## Root cause
Filesystem walk instead of tracked-file listing; build dirs under a source root.

## Why agents fall for it
The failure looks exactly like a real regression (names linters, counts, file:line). Without the memory note an agent would start "fixing" ignores or seeding budgets.

## Current state
Still open (checked 2026-09-23 on the current checkout, `bf3d250f132`). `dev/src/dev/kondo_ratchet.clj:198-214` `tracked-files` uses `git ls-files -z`, but only `repository-linters` (`:228-239`, the `.clj-kondo` config dir) calls it. `scan` (`:459-467`) still does `(file-seq (io/file root))` over `source-roots` (`:284-285`), and `mage/src/mage/kondo_ratchet.clj:502` plus `dev/src/dev/kondo_ratchet.clj:916,998` call `scan`. The gitignored `modules/drivers/mongo/target/jar` still exists in the main checkout. Memory `reference_kondo_ratchet_fixer_ignores_gitignore.md` (MEMORY.md index line: "phantom warnings; re-check clean checkout") is accurate.

## Suggested fix
Have `scan` enumerate files through `tracked-files` (or filter `file-seq` through `git ls-files`) so gitignored build output under `modules/drivers/*/target` is never read. Then retire the memory entry so agents stop building clean worktrees for every ratchet run.

## Detection signal
Paths containing `/target/` or other gitignored dirs in a lint/ratchet failure; agent creating temporary worktrees purely to re-run a check.

## Raw excerpts
```
L218 [TOOL Bash] ... git check-ignore -v modules/drivers/druid/target/jar/metabase/driver/druid/query_processor.clj
L219 [RESULT] .gitignore:77:/modules/drivers/*/target	modules/drivers/druid/target/jar/metabase/driver/druid/query_processor.clj
(def ^:private source-roots
  ["src" "test" "enterprise" "modules/drivers" "dev" "bin" "mage"])
```

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/48981bba-503a-49e5-a945-9a5c51572a3a.jsonl
  lines: 333-357
  date: 2026-09-14/15
  jev: {self_inflicted_bug: 0.87, tool_misuse: 0.81, misleading_signal: 0.60, user_correction: 0.75, codebase_trap: 0.69, flailing: 0.42, env_friction: 0.56}

This hit again in the main checkout, after the date this file gives for the fix. The agent ran `./bin/mage kondo-ratchets` as a check for its new report task:
```
L334/L357 [RESULT] Unsupported :clj-kondo/ignore syntax on lines 104, 121; use the literal ignore key first in its map in modules/drivers/mongo/target/jar/metabase/driver/mongo/connection.clj
```
It was the last line of output. The agent did not comment on it and went on with other work, so the ratchet check did not validate anything in that session.

**Correction to "Current state" above (checked 2026-09-23 on the current checkout):** `tracked-files`
(`dev/src/dev/kondo_ratchet.clj:198`, `git ls-files -z`) is used only by `repository-linters`
(`:228-239`, the `.clj-kondo` config dir). `scan` (`:459-467`) still walks the filesystem:
`(for [root roots ^java.io.File f (file-seq (io/file root)) ...])` over `source-roots`
(`:284`, `["src" "test" "enterprise" "modules/drivers" "dev" "bin" "mage"]`). The gitignored
`modules/drivers/mongo/target/jar/...` still exists in the main checkout. So the scanner gap looks
**still open** for inline ignores. The status should probably be `documented-still-hit`, not `fixed`.
The memory `reference_kondo_ratchet_fixer_ignores_gitignore.md` is still accurate.
