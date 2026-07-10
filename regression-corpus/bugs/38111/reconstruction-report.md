# Reconstruction report — metabase#38111

_Verbatim final report from the worktree-isolated reconstruction agent (a00be6da151c0e05d)._

---

Reconstruction complete and verified. Here is my report.

## Summary

The bug for metabase#38111 (fix commit `03905e7`, "Bulk filter modal incorrectly suggests that you can filter by values in a JSON column") was reintroduced semantically.

### 1. Reconstruction (unified diff)
The product file moved from `src/metabase/types.cljc` to `src/metabase/types/core.cljc` (that's the drift; the fix commit's original diff path no longer exists). The fix had removed `(derive :type/Structured :type/Text)`. I re-added it in the equivalent current location:

```diff
diff --git a/src/metabase/types/core.cljc b/src/metabase/types/core.cljc
@@ -326,6 +326,7 @@
 (derive :type/Structured :Semantic/*)
+(derive :type/Structured :type/Text)
 
 (derive :type/SerializedJSON :type/Structured)
```

File: `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-a00be6da151c0e05d/src/metabase/types/core.cljc`

### 2. Oracle
- ns/name: `metabase.lib.types.isa-test/string?-test` (`test/metabase/lib/types/isa_test.cljc:140`)
- Baseline (clean worktree): PASS — 2 assertions, 0 failures.
- Reconstructed: FAIL — 2 assertions, 1 failure, 0 errors. The failing assertion is line 142: `(false? (string? {:effective-type :type/JSON :semantic-type :type/SerializedJSON}))` → `actual: (not (false? true))`. Code loads/compiles cleanly (it ran), so this is a true test-assertion failure.

### 3. failure_shape
- symptom: A JSON column (effective type `:type/JSON`) is misclassified as a string. In the UI this makes the bulk filter modal offer string-value filtering on JSON columns, which is invalid.
- repro_failure: `lib.types.isa/string?` returns `true` instead of `false` for a JSON column, tripping the `is (false? ...)` assertion.

### 4. Confidence: HIGH
Adversarial reasoning: This is the actual historical regression, not an incidental trip. The `string` category is defined as `::string {:effective-type [:type/Text]}` (in `src/metabase/lib/types/constants.cljc`), and `field-type?` tests `(isa? (:effective-type column) :type/Text)`. The type hierarchy is `:type/JSON` → `:type/Structured`. Re-adding `(derive :type/Structured :type/Text)` reconnects `:type/JSON` to `:type/Text` through `:type/Structured`, so `(isa? :type/JSON :type/Text)` becomes true and `string?` wrongly returns true for JSON columns — precisely the "filter modal suggests you can filter by values in a JSON column" behavior the fix addressed. The removed line was the exact one-line change of the original fix; the first assertion (`:type/Text` effective type) still passes both before and after, confirming the change is narrowly targeted at the JSON path rather than broadly breaking `string?`.

### 5. Ambiguity
None material. The only wrinkle was the file relocation (`types.cljc` → `types/core.cljc`), which is why `git apply -R` of the original diff would fail; the semantic change transferred cleanly. A second `string?-test` also exists at `test/metabase/lib_metric/types/isa_test.cljc:128`, but the primary oracle in `metabase.lib.types.isa-test` is the intended one and demonstrates the regression.
