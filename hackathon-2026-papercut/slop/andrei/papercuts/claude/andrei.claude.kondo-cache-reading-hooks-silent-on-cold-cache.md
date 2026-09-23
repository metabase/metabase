---
title: `./bin/mage kondo` cleared the Kondo cache and linted in one pass, so cache-reading hooks such as `:metabase/prefer-with-dynamic-fn-redefs` never fired, locally or in CI, and a new `with-redefs` stub passed every lint gate until a reviewer indexed the redefined namespace
slug: kondo-cache-reading-hooks-silent-on-cold-cache
kind: misleading-signal
impact: introduced-bug
severity: medium
status: fixed # mage kondo warms the cache with a throwaway pass since 2026-09-15
area: mage/src/mage/kondo.clj, .clj-kondo hooks reading .clj-kondo/.cache (hooks/ns-analysis), :metabase/prefer-with-dynamic-fn-redefs, CI be-linter-clj-kondo
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/b95fa36b-8d10-4667-8dcc-e441cdf5aced.jsonl
    lines: 457-602
    date: 2026-09-11
    jev: {any_papercut: 0.93, env_toolchain: 0.72, stale_state: 0.51, verify_mismatch: 0.76, misleading_code: 0.48, hidden_coupling: 0.54, stale_docs: 0.25, tool_footgun: 0.80, flaky: 0.87, agent_bug: 0.91, wasted_effort: 0.67, user_correction: 0.27}
---
## Summary
The fix's regression test redefined `queries.db/card-queries` with `with-redefs`. The agent linted the two changed files with `./bin/mage kondo`: clean. CI's kondo job passed too. A review found the violation only after linting `src/metabase/queries/db.clj` first, because the hook needs the redefined var's namespace in the cache to know it is a `defn`. The agent reproduced it with the reviewer's two-step command, swapped to `mt/with-dynamic-fn-redefs` and explained the cold-cache gap; master added a warm-up pass four days later.

## Symptom
- Chunk 0 L198-L212: `./bin/mage kondo` on the two changed files: `errors: 0, warnings: 0` (after a namespace-sort fix).
- L471 (review report): "After indexing `src/metabase/queries/db.clj`, linting the changed files reports that exact warning ... The actual PR CI kondo job passed; the warning depends on available namespace analysis."
- L558-L559: reviewer's two-step command reproduces `warning: Every binding here redefines a defn-style var – prefer metabase.test/with-dynamic-fn-redefs ...`.

## Timeline
- Chunk 0 L135: regression test written with `with-redefs`.
- Chunk 0 L198-L212: scoped mage kondo reports clean; CI kondo later passes.
- L457-L471: user asks to address a review; the report flags the `with-redefs` stub.
- L518-L552: rewritten with `mt/with-dynamic-fn-redefs` and `mt/original-fn` (with a detour, see git-stash-revert-probe-noop-on-committed-fix).
- L558-L559: warning reproduced with a warm cache; only the pre-existing line 1298 remains.
- Cost: a lint violation shipped in a PR and needed a review round and an extra commit.

## Root cause
`hooks/ns-analysis` reads only `.clj-kondo/.cache`, which Kondo writes after a run finishes; `mage kondo` deleted the cache and linted in a single pass, so hooks asking about another namespace's vars found nothing and skipped the check (per the fixing commit's message).

## Why agents fall for it
The repo's own lint entry point and the CI job both reported clean; nothing signalled that some linters were inert.

## Current state
Checked origin/master: commit aecbc3c3cbd (2026-09-15, "Warm the Kondo cache so cache-reading hooks run in CI") makes mage kondo lint once and discard findings before the real pass; mage prints "Warming the Kondo cache so cache-reading hooks can see every namespace...".

## Suggested fix
- Done on master: warm-up pass in mage kondo, kondo-redundant-ignores and kondo-insert-ignores.
- Remaining: when a hook cannot find analysis for a namespace it needs, emit a warning instead of silently skipping.

## Detection signal
A reviewer or CI flagging `:metabase/prefer-with-dynamic-fn-redefs` (or another cache-reading hook) on code a local `mage kondo` run passed.

## Raw excerpts
```
L212 [RESULT] (chunk 0) Running Kondo on: [src/metabase/queries/models/card.clj test/metabase/queries/models/card_test.clj] | linting took 552ms, errors: 0, warnings: 0
L471 [RESULT] ... **Low: Use `mt/with-dynamic-fn-redefs` for the new function stub.** ... After indexing `src/metabase/queries/db.clj`, linting the changed files reports that exact warning at line 1714 and exits 2. ... The actual PR CI kondo job passed; the warning depends on available namespace analysis.
L558 [CALL] Bash: mise exec -- clojure -M:kondo --lint src/metabase/queries/db.clj >/dev/null 2>&1; mise exec -- clojure -M:kondo --lint src/metabase/queries/models/card.clj test/metabase/queries/models/card_test.clj 2>&1 | tail -6; echo "exit=$?"
L559 [RESULT] test/metabase/queries/models/card_test.clj:1298:5: warning: Every binding here redefines a defn-style var – prefer metabase.test/with-dynamic-fn-redefs for thread-safe redefs. [:metabase/prefer-with-dynamic-fn-redefs] | linting took 707ms, errors: 0, warnings: 1 | exit=0
```
