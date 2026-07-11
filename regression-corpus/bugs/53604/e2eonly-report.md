Done. Cleanup complete, mutation left in the worktree.

## Report

### 1. git diff (product mutation)
`src/metabase/lib/drill_thru/underlying_records.cljc`, inside `drill-filter`:
```clojure
-                        (let [bucket (or (::lib.underlying/temporal-unit column)
-                                         (lib.temporal-bucket/temporal-bucket column))
+                        (let [bucket (::lib.underlying/temporal-unit column)
                               unit   (cond-> bucket
```
This is a faithful semantic revert of the load-bearing hunk of fix `5ec56ea` (which changed `(::lib.underlying/temporal-unit column)` → `(or (::lib.underlying/temporal-unit column) (lib.temporal-bucket/temporal-bucket column))`).

**Identifying the load-bearing change (pf=3):** The commit touched three seams. I empirically ruled out the one that looks primary — the `breakout->resolved-column` → `breakout->filterable-column` (column-ref-based matching) swap in the same fn. Reverting *that* is behaviorally **inert** in today's code: I confirmed via REPL that both paths now emit correct name-based refs (`"CREATED_AT"`, not `"CREATED_AT_2"`) — the field-refs overhaul the fix's TODO comments anticipated has since landed, so the multi-breakout disambiguation no longer depends on it. The observable bug survives only through the temporal-unit `or`: these card-sourced breakout columns carry their unit in `:lib/temporal-unit` (read by `lib.temporal-bucket/temporal-bucket`), not `::lib.underlying/temporal-unit`, so dropping the second disjunct makes `unit` nil.

### 2. Witness
Outcome class is backend, so **no jest witness** (fix is `.cljc`). The cheaper oracle is a Clojure deftest, and one already ships in the repo covering exactly this case — no new file needed:

`test/metabase/lib/drill_thru/underlying_records_test.cljc` → `native-query-with-multiple-breakouts-on-same-column-test` (asserts the drill yields two `:between` range filters).

Oracle (run in the worktree nREPL, loaded from worktree src):
- **PASS on clean**: `Ran 1 tests containing 2 assertions. 0 failures, 0 errors.`
- **FAIL on mutant**: `FAIL ... expected [:between ... [:field {:temporal-unit :month} "CREATED_AT"] "2023-07-01" "2023-07-31"] ... diff: (not= :between :=)`

Also confirmed the same via `./bin/test-agent :only '[...native-query-with-multiple-breakouts-on-same-column-test]'`.

### 3. Bug summary
With multiple breakouts on the same column (native/card-sourced question broken out by `CREATED_AT` month **and** `CREATED_AT` year), the "See these records" underlying-records drill must emit bucketed range filters — `CREATED_AT is May 1–31, 2024` and `CREATED_AT is Jan 1 – Dec 31, 2024` (e2e row count 520). The mutant drops the temporal unit, so it instead emits exact-timestamp equalities: `[:= CREATED_AT "2023-07-01T00:00:00Z"]` and `[:= [:field {:temporal-unit :year}...] "2023-01-01T00:00:00Z"]` — wrong filter semantics and a wrong (near-zero) row count. Matches the e2e in `e2e/test/scenarios/models/reproductions-3.cy.spec.ts` (grep `metabase#53604`).

### 4. Outcome
**`no_witness_backend`** — the fix is `metabase.lib` `.cljc` (ClojureScript-shared but authored/testable in Clojure). A jsdom jest test is not the right oracle; a Clojure(Script) `deftest` is the direct, cheaper one, and it already exists and discriminates the mutation sharply. Not irreducible: the observable is a pure MBQL value (the generated `:filters` clause), asserted with no render, routing, network, or browser API.

### 5. Confidence
High. I proved the mutation reintroduces the bug at the value level via live REPL introspection of the exact query/context from the shipped test (clean → two `:between` ranges; mutant → two `:=` exact-timestamp filters), and the in-repo deftest flips clean-PASS → mutant-FAIL with a clean value assertion (`(not= :between :=)`), not a compile error. I also verified the "obvious" seam (`breakout->filterable-column`) is inert today, so this minimal one-hunk revert is the correct, faithful reintroduction. The `column-ref` param of `drill-filter` is now unused by the mutated binding but remains a valid parameter (no compile impact).

Note: `.nrepl-port` in the main checkout was stale (pointed at a dead server); I removed the stale file I/the alias created in the worktree and killed the temporary nREPL I started.