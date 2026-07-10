# Reconstruction report — metabase#32126

_Verbatim final report from the worktree-isolated reconstruction agent (a592aac10592a4d13)._

---

## Reconstruction Summary

**Reconstruction diff** (`src/metabase/parameters/dashboard.clj`):

```diff
--- a/src/metabase/parameters/dashboard.clj
+++ b/src/metabase/parameters/dashboard.clj
@@ -100,11 +100,10 @@
          param       (get-in dashboard [:resolved-params param-key])
          field-ids   (into #{} (map :field-id (param->fields param)))]
      (if (empty? field-ids)
-       (or (filter-values-from-field-refs dashboard param-key)
-           (throw (ex-info (tru "Parameter {0} does not have any Fields associated with it" (pr-str param-key))
-                           {:param       (get (:resolved-params dashboard) param-key)
-                            :param-key   param-key
-                            :status-code 400})))
+       (throw (ex-info (tru "Parameter {0} does not have any Fields associated with it" (pr-str param-key))
+                       {:param       (get (:resolved-params dashboard) param-key)
+                        :param-key   param-key
+                        :status-code 400}))
        (try
          (let [;; results can come back as [[value] ...] *or* as [[value remapped] ...].
                results         (map (if (seq query)
```

(The `filter-values-from-field-refs` function still exists in the file but is now unreferenced dead code — the fix's actual behavioral seam was the fallback dispatch in `chain-filter`, which I reverted.)

**Note on file location**: the code has since been moved from `src/metabase/api/dashboard.clj` (as named in the task) to `src/metabase/parameters/dashboard.clj` as part of a module extraction. Same function (`chain-filter`), same logic, just relocated. The historical `filter-values-from-field-refs` helper also picked up an additional fallback (`lib/parameter-target-expression-ref`) since the original fix, but that's an orthogonal later enhancement, not something I needed to touch.

**Oracle**: `metabase.dashboards-rest.api-test/param-values-no-field-ids-test` (`test/metabase/dashboards_rest/api_test.clj:4361`)

- **Baseline** (unmodified worktree): PASS — 4 assertions, 0 failures, 0 errors.
- **Reconstructed**: FAIL — 4 assertions, 4 failures, 0 errors. All 4 failures are `mt/user-http-request` assertion mismatches, not compile/load errors — the `GET dashboard/:id/params/:param-key/values` endpoint now throws a 400 `ExceptionInfo` ("Parameter ... does not have any Fields associated with it") for both the `_USER_SOURCE_` and `_CITY_IS_NOT_` parameters, instead of returning resolved dropdown values.

**failure_shape**:
- `symptom`: GET `/api/dashboard/:id/params/:param-key/values` returns HTTP 400 "Parameter {id} does not have any Fields associated with it" for dashboard parameters mapped only via nested-query field refs (e.g. `[:field "SOURCE" {:base-type :type/Text}]`), instead of the dropdown values.
- `repro_failure`: `./bin/test-agent :only '[metabase.dashboards-rest.api-test/param-values-no-field-ids-test]'` → 4 assertions, 4 failures, 0 errors (test-assertion failures, code loads/compiles fine).

**Confidence: high.** Adversarial check: the fix commit's whole purpose was adding the `filter-values-from-field-refs` fallback specifically for the case `(empty? field-ids)` — i.e., when a parameter's mapping target is a field-ref-only dimension (typical of nested/native-query source cards) rather than a resolvable field-id. My revert removes exactly that fallback and restores the unconditional throw that existed pre-fix, which is the literal historical bug: dropdown values for filters mapped to nested-query fields by name/ref (not id) were unavailable and the endpoint 400'd. The test failure mode (400 exception with that exact message, for both parameters in the test, both of which map via `[:field "SOURCE"/"CITY" ...]` refs against a native-query-backed nested card) is precisely the scenario #32126 and this fix describe — not an incidental trip of the assertion via some unrelated code path.

**Ambiguity**: none of consequence. The only wrinkle is the pre-existing drift from file move (`api/dashboard.clj` → `parameters/dashboard.clj`) and a later, unrelated enhancement to `filter-values-from-field-refs` (added `lib/parameter-target-expression-ref` alongside `lib/parameter-target-field-ref`) — neither affects the correspondence between this revert and the original bug, since the behavioral defect is entirely in the `chain-filter` dispatch branch I reverted, not in the internals of the helper.
