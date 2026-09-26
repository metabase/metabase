# Reconstruction report — metabase#49305

_Verbatim final report from the worktree-isolated reconstruction agent (a25230e85e6f77151)._

---

Reconstruction complete. Here is the report.

## 1. `git diff`

Only `src/metabase/lib/schema/filter.cljc` is modified (7 lines). The 12 filter clauses that fix #49129 added to the boolean set have their return type flipped `:- :type/Boolean` → `:- :type/*`:

- `:between`, `:inside`
- `:is-null` / `:not-null` (doseq)
- `:is-empty` / `:not-empty` (doseq)
- `:starts-with` / `:ends-with` / `:contains` / `:does-not-contain` (doseq)
- `:time-interval`, `:relative-time-interval`

The 9 pre-fix boolean clauses (`< <= > >= = != and or not`) are left as `:type/Boolean`. `legacy_mbql/schema.cljc` is untouched (restored — see below).

## 2. Oracle ns / name + results

- **Named oracle:** `col-info-expressions-test` in `annotate_test.clj` — but that test has since been split and relocated.
- **Actual current oracle:** `metabase.lib.metadata.result-metadata-test/col-info-expressions-test-1b` in `test/metabase/lib/metadata/result_metadata_test.cljc`. This deftest holds the fix-added boolean assertions (the `doseq` over 21 boolean expressions asserting `{:base-type :type/Boolean}`).
- **Baseline (worktree cwd):** 21 assertions, 0 failures.
- **Reconstructed:** 21 assertions, **12 failures, 0 errors** — the 12 fix-added clauses fail; the 9 pre-fix clauses still pass. Sibling `col-info-expressions-test` (the non-boolean `double-price` case): still passes.

## 3. failure_shape

Genuine assertion failure, not a load/compile error:
```
expected: {:base-type :type/Boolean}
  actual: {:base-type :type/*, ...}
```
This is precisely the historical bug: boolean functions used as custom columns fall through to `:type/*` instead of being recognized as boolean.

## 4. Confidence + adversarial reasoning

**Confidence: high** that the reconstruction is correct and faithful — but with an important **product-file divergence** the orchestrator must note.

- The named product file, `src/metabase/legacy_mbql/schema.cljc`, is **no longer load-bearing** for this test. I proved this empirically: reverting `boolean-functions` there to the pre-fix 9-element set left the test at 21/0 (zero effect). That set now only drives legacy-MBQL `:dispatch` fns (`::ExpressionArg`, `::Filter`, `::FieldOrExpressionRef`), not result-metadata base-type.
- The behavior migrated during the annotate → Lib result-metadata refactor. `annotate/col-info-for-field-clause*` no longer exists; base-type now comes from `expression/type-of-method`, which `define-mbql-clause` registers from the `:- <return-type>` in `filter.cljc`. A single-clause probe (`:between` → `:type/*`) produced exactly the historical failure shape on exactly the `[:between …]` assertion, confirming the locus before I applied the full revert.
- Adversarial checks: 0 errors (not a namespace load failure); the 12/9 split maps exactly to fix-added vs. pre-fix clauses; the actual value `:type/*` matches the pre-fix `:else` branch semantics; baseline passed before edits and the unrelated sibling assertion still passes (localized).

## 5. Ambiguity

Not a `reconstruction_failed` — the bug is faithfully reproduced and the failure shape matches. The one caveat: **the reconstruction lives in `src/metabase/lib/schema/filter.cljc`, not the historically-named `src/metabase/legacy_mbql/schema.cljc`.** A `git apply -R` of the original schema.cljc hunk would NOT reproduce the bug in current master, because the type-inference responsibility moved into Lib. The minimal semantic revert had to target the current locus.

Relevant files (absolute):
- Reconstructed: `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-a25230e85e6f77151/src/metabase/lib/schema/filter.cljc`
- Oracle test: `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-a25230e85e6f77151/test/metabase/lib/metadata/result_metadata_test.cljc`
- Named-but-vestigial product file: `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-a25230e85e6f77151/src/metabase/legacy_mbql/schema.cljc`
