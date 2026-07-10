# Reconstruction report — metabase#47584

_Verbatim final report from the worktree-isolated reconstruction agent (a6e9f3eefde62921e)._

---

Reconstruction complete and proven. Here is the full report.

## 1. Reconstruction (unified diff)

```diff
diff --git a/src/metabase/lib/field/util.cljc b/src/metabase/lib/field/util.cljc
index 193d772c36e..e7c8f10aaf2 100644
--- a/src/metabase/lib/field/util.cljc
+++ b/src/metabase/lib/field/util.cljc
@@ -70,7 +70,7 @@
 
   The zero arity is a transducer version."
   ([]
-   (let [deduplicated-name-fn (lib.util.unique-name-generator/non-truncating-unique-name-generator)]
+   (let [deduplicated-name-fn (lib.util.unique-name-generator/unique-name-generator)]
      (map (fn [col]
             (assoc col
                    :lib/original-name     ((some-fn :lib/original-name :name) col)
```

Single-line semantic revert in `src/metabase/lib/field/util.cljc` (`add-deduplicated-names`, line 73).

**Why this is the locus (the code drifted, so no `git apply -R` was possible):** The fix commit changed `annotate-native-cols` in `annotate.clj` from the truncating `lib.util/unique-name-generator` back to the non-truncating legacy `mbql.u/unique-name-generator`. That function no longer exists — native result-column name deduplication migrated into Lib. The direct descendant is `lib.field.util/add-deduplicated-names`, which sets `:lib/deduplicated-name` (copied into the column `:name` by `result_metadata/deduplicate-names`, and feeding desired-column-aliases via `add-source-and-desired-aliases-xform`). It currently uses `non-truncating-unique-name-generator`, whose own docstring says "matching the 'classic' behavior in QP results metadata" — i.e. the modern stand-in for the legacy generator the fix reverted to. Flipping it to the truncating `unique-name-generator` semantically undoes the fix.

## 2. Oracle namespaces / names + results

- `metabase.query-processor.api-test/native-query-with-long-column-alias` (`test/metabase/query_processor/api_test.clj:257`)
- `metabase.query-processor.nested-queries-test/card-id-native-source-query-with-long-alias-test` (`test/metabase/query_processor/nested_queries_test.clj:357`)

| | Baseline (unmodified) | Reconstructed |
|---|---|---|
| Summary | 2 tests, **6 assertions, 0 failures, 0 errors** — all pass | 2 tests, 6 assertions, **2 failures, 1 error** |
| `native-query-with-long-column-alias` | pass | **2 FAIL** assertions (`POST /api/dataset/native` and `POST /api/dataset`) |
| `card-id-native-source-query-with-long-alias-test` | pass | **1 ERROR** — `qp/process-query` throws "Column not found" (the bug's runtime symptom) |

The api-test yields genuine test-assertion FAILs (requirement satisfied). The nested-test ERROR is a runtime query-execution exception, not a compile/load error — the namespace loaded and compiled fine (baseline compiled; the reconstructed run executed both tests and 3 assertions still passed).

## 3. failure_shape

- **symptom:** A saved native query whose column alias exceeds 60 bytes has that alias truncated (to 51 chars + `_` + 8-hex CRC32 checksum) when its result metadata is computed. An outer query wrapping that native card as a source then references the *truncated* alias, while the inner native SQL still emits the *full* alias — so the column can't be resolved.
- **repro_failure:** Query execution fails with H2 error `Column "__mb_source.Total_number_of_people_from_each_state_separated_by_00028d48" not found`. Generated SQL: outer `SELECT "__mb_source"."Total_number_of_people_..._00028d48" ...` over inner `SELECT "PUBLIC"."PEOPLE"."STATE" AS "Total_number_of_people_..._state_and_then_we_do_a_count" ...`. The truncated-vs-full alias mismatch is the exact defect.

## 4. Confidence + adversarial reasoning

**Confidence: high.** The correspondence to the historical bug is tight on every axis:
- **Same operation** — unique-name/deduplication of native result columns.
- **Same two generators** — truncating vs non-truncating, where the fix deliberately chose non-truncating.
- **Same truncation mechanism** — 60-byte cap = 51 chars + `_` + 8-hex CRC32, via `truncate-alias`.
- **Same exact symptom** — outer query references the truncated alias `..._00028d48` while the inner native query emits the full name → "Column not found". Notably, the api-test hard-codes a guard against the literal hash suffix `_00028d48` (line 279), and the reconstructed run produces precisely that suffix — the test was written against this exact failure signature.

**Adversarial check — is this THE bug or merely *a* change that trips the test?** It is the bug. A cheaper "trip the test" change (e.g. flipping only the `native-stage?` branch in `add-source-and-desired-aliases-xform`) would corrupt the desired-column-alias while leaving `:name` un-truncated, giving an inconsistent partial reproduction. My change hits the deduplicated name at its source — the same job `annotate-native-cols` did — so both the returned `:name` and the SQL alias truncate together, matching the historical behavior exactly.

## 5. Ambiguity / caveats

One honest imprecision: `add-deduplicated-names` is used for *all* queries, whereas the historical change was scoped to `annotate-native-cols` (native only). In practice this is effectively native-scoped anyway — truncation only bites names > 60 bytes, and only user-authored native aliases reach that length (MBQL columns are DB identifiers, generally short and pre-deduplicated). So the behavioral blast radius matches the historical one, and the oracle tests confirm the native path reproduces the original defect. This is a faithful semantic reconstruction, not a cleanly reverse-applicable diff (the fix's original file `annotate.clj` no longer contains the touched code).

Relevant files (absolute):
- `/Users/fraser/Documents/code/metabase/src/metabase/lib/field/util.cljc` (reconstruction locus, line 73)
- `/Users/fraser/Documents/code/metabase/src/metabase/lib/util/unique_name_generator.cljc` (the two generators + `truncate-alias`)
- `/Users/fraser/Documents/code/metabase/src/metabase/lib/metadata/result_metadata.cljc` (`deduplicate-names` / `add-source-and-desired-aliases` pipeline)
- `/Users/fraser/Documents/code/metabase/src/metabase/query_processor/middleware/annotate.clj` (historical fix site; `annotate-native-cols` is gone)

Note: I left the reconstruction applied in the worktree (no commit). Revert the one-line change in `field/util.cljc` to restore the fix.
