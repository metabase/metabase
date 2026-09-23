---
title: `./bin/mage kondo-updated` never copies the dependency kondo configs, so in a fresh worktree it reports bogus errors ("Could not find namespace: hooks.toucan2.tools.with-temp", unresolved symbols) until `.clj-kondo/imports` is copied in by hand
slug: kondo-updated-skips-dependency-config-copy
kind: tool-quirk
impact: wasted-time
severity: medium
status: open # origin/master mage/src/mage/kondo.clj: kondo-updated* never calls copy-configs-if-needed!
area: mage/src/mage/kondo.clj (kondo-updated vs kondo), .clj-kondo/imports, git worktrees under ~/src/mb/wt
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/758d7b46-4e50-449e-83b2-4a35df2a52e9.jsonl
    lines: 410-449
    date: 2026-08-27
    jev: {any_papercut: 0.87, env_toolchain: 0.89, stale_state: 0.61, verify_mismatch: 0.39, misleading_code: 0.26, hidden_coupling: 0.79, stale_docs: 0.32, tool_footgun: 0.84, flaky: 0.27, agent_bug: 0.72, wasted_effort: 0.58, user_correction: 0.21}
---
## Summary
In a new worktree for an env-var change, `./bin/mage kondo-updated origin/master` reported 14 errors in a test file: the toucan2 with-temp hook could not be loaded and its bindings showed up as unresolved symbols. The same file linted clean in the main checkout. Copying the kondo cache did not help; diffing the two `.clj-kondo` directories showed the worktree lacked `imports/` and `.deps.edn.md5sum`, and copying them made it clean.

## Symptom
- L416: `WARNING: file hooks/toucan2/tools/with_temp not found while loading hook` repeated, `Unresolved symbol: group-a`, `errors: 14`.
- L435: the main checkout lints the same file with `errors: 0, warnings: 0`.

## Timeline
- L410-L416: kondo-updated in the worktree: 14 errors.
- L420-L425: removes a real unused require; still 14 errors.
- L434-L435: main checkout: clean.
- L439-L440: copies `.clj-kondo/.cache`: still 14.
- L444-L445: diff shows missing `imports` and `.deps.edn.md5sum`.
- L448-L449: copies both: `errors: 0, warnings: 0`.
- Cost: 6 calls; a less careful agent might have "fixed" the phantom unresolved symbols.

## Root cause
`mage kondo` runs `copy-configs-if-needed!` (clj-kondo `--copy-configs --dependencies` into `.clj-kondo/imports`, keyed on a deps.edn md5), but `kondo-updated*` goes straight to `clojure -M:kondo --lint <files>`. `.clj-kondo/imports` is gitignored, so a fresh worktree has no dependency hooks until someone runs the full `mage kondo`.

## Why agents fall for it
kondo-updated is the documented fast path for a branch, and its errors look like real lint findings in the changed test file.

## Current state
origin/master mage/src/mage/kondo.clj: `kondo*` calls `(copy-configs-if-needed!)`; `kondo-updated*` only warms the cache (added 2026-09-15) and lints.

## Suggested fix
- Call `copy-configs-if-needed!` at the start of `kondo-updated*`.
- Or have the worktree recipe run `./bin/mage kondo --copy-configs` once after `git worktree add`.

## Detection signal
kondo output with `Could not find namespace: hooks.` or `file hooks/... not found while loading hook` in a worktree path.

## Raw excerpts
```
L411 [RESULT] ok | ... | enterprise/backend/test/metabase_enterprise/metabot/api/permissions_test.clj:215:11: error: Error while loading hook for metabase.test/with-temp: Could not find namespace: hooks.toucan2.tools.with-temp. | linting took 331ms, errors: 14, warnings: 2
L415 [CALL] Bash: ./bin/mage kondo-updated origin/master 2>&1 | grep -v "with-temp\|Unresolved symbol: gid" | tail -20
L416 [RESULT] ... WARNING: file hooks/toucan2/tools/with_temp not found while loading hook | ... permissions_test.clj:64:49: error: Unresolved symbol: group-b | linting took 338ms, errors: 14, warnings: 2
L434 [CALL] Bash: cd ~/src/mb/metabase && ./bin/mage kondo enterprise/backend/test/metabase_enterprise/metabot/api/permissions_test.clj 2>&1 | tail -3
L435 [RESULT] Running Kondo on: [enterprise/backend/test/metabase_enterprise/metabot/api/permissions_test.clj] | linting took 263ms, errors: 0, warnings: 0
L439 [CALL] Bash: cp -R ~/src/mb/metabase/.clj-kondo/.cache ~/src/mb/wt/<worktree>/.clj-kondo/ 2>/dev/null; cd ~/src/mb/wt/<worktree> && ./bin/mage kondo-updated origin/master 2>&1 | tail -3
L440 [RESULT] ... error: Error while loading hook for metabase.test/with-temp: Could not find namespace: hooks.toucan2.tools.with-temp. | linting took 454ms, errors: 14, warnings: 0
L445 [RESULT] 2d1 | < .deps.edn.md5sum | 6d4 | < imports | --- toucan2 cfg ---
L448 [CALL] Bash: cp -R ~/src/mb/metabase/.clj-kondo/imports ~/src/mb/metabase/.clj-kondo/.deps.edn.md5sum ~/src/mb/wt/<worktree>/.clj-kondo/ && ./bin/mage kondo-updated origin/master 2>&1 | tail -3
L449 [RESULT] test/metabase/cmd/config_file_gen_test.clj |    test/metabase/cmd/env_var_dox_test.clj | linting took 416ms, errors: 0, warnings: 0
```
