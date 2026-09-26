# Reconstruction report — metabase#44231

_Verbatim final report from the worktree-isolated reconstruction agent (a6169590e53429987)._

---

## Summary

**Reconstruction diff** (applied to the worktree; not committed):

```
src/metabase/parameters/dashboard.clj | 8 ++------
src/metabase/parameters/params.clj    | 4 ++--
2 files changed, 4 insertions(+), 8 deletions(-)
```

Full diff shown above. Two behavioral reverts, corresponding to the two distinct sub-bugs bundled in fix commit `337dbbe074c9`:

1. **`src/metabase/parameters/dashboard.clj`** (moved from `src/metabase/api/dashboard.clj`) — `combine-chained-filter-results` reverted from the "sort-by-count, index-by-first, keep-remapped-priority" merge back to the pre-fix `(distinct (mapcat :values results))` + single count-based sort. This reintroduces silent data corruption when chain-filter results for different field-ids come back with mixed shapes (`[id]` vs `[id remapped]`) — duplicates aren't merged, and only one field's tuple-shape controls the sort key for the whole combined set.
2. **`src/metabase/parameters/params.clj`** (moved from `src/metabase/models/params.clj`) — `Field:params-columns-only` no longer selects `:fk_target_field_id`, and the `t2/hydrate` call in `param-field-ids->fields` no longer hydrates `[:target :name_field]` (the fix-era bare `:target` later got refactored into this nested form by an unrelated commit; I removed that hydrate key entirely rather than `git apply -R`-style literal reversal, since the file has drifted).

`src/metabase/util/malli/schema.clj` (the third file named in the fix commit) was **not** touched — the current `FieldValuesList` schema (`[:sequential [:or RemappedFieldValue NonRemappedFieldValue]]`) is a strict superset of the old one and doesn't reject the reintroduced buggy mixed-shape output, so reverting it wasn't needed to reproduce the bug and would only have added unrelated risk (malli validation exceptions on `chain-filter`'s `mu/defn` return schema).

**Oracle tests**: `metabase.dashboards-rest.api-test/get-dashboard-param-fields-has-target-test`, `metabase.dashboards-rest.api-test/chain-filter-result-can-have-mixed-of-remapped-and-non-remapped-values-test`, `metabase.parameters.dashboard-test/combined-chained-filter-results-test`.

- **Baseline** (clean worktree, fix intact): `4 assertions, 0 failures, 0 errors` — all 3 pass.
- **Reconstructed** (bug reintroduced): `4 assertions, 3 failures, 0 errors` — all 3 fail, each as a clean assertion mismatch, not a compile/load error.

**Failure shapes**:
- *symptom*: public/embedded dashboards silently drop remapped ("human-readable") values for FK parameters — chain-filter dropdowns show raw IDs instead of display names when a parameter maps to a mix of remapped and non-remapped fields, and `:param_fields` loses `:target`/`:fk_target_field_id` metadata needed to resolve FK targets.
- *repro_failure* (get-dashboard-param-fields-has-target-test): expected `:fk_target_field_id 16` and `:target {:id 16, :name_field {:id 20}}`; actual has neither key (both silently `nil` via missing-key).
- *repro_failure* (chain-filter-result-can-have-mixed...): expected values `[[id "Aerodynamic Bronze Hat"] ...]`; actual `((1) (2) (3))` — remapping silently lost, no exception thrown.
- *repro_failure* (combined-chained-filter-results-test): expected merged `[[1] [2 "B"] [3] [4 "A"] [5 "C"] [6 "D"]]`; actual unmerged duplicates `([1] [2] [2 "B"] [3] [4] [4 "A"] [5 "C"] [6 "D"])`.

**Confidence: high.** All three failures matched my pre-run analytical prediction of the exact output shape before executing the reconstructed test run (I hand-traced `distinct`+`sort-by count/first/second` against the test's literal input and predicted the exact duplicate list, which the actual run reproduced verbatim). Adversarial check: I inspected sibling tests in the same files (`dashboard-field-params-field-names-test`, `fetch-dashboard-test-3`, `combined-chained-filter-fixture-test`) that reference `:target`/`:fk_target_field_id` — those use the `=?` fuzzy matcher and either expect literal `nil` or don't check those keys at all, so a missing key (post-revert) still satisfies them; they remain green.

**Collateral note (not part of the oracle, but observed)**: running the full `metabase.parameters.dashboard-test` and `metabase.parameters.params-test` namespaces shows 4 total failures (the 3 oracle failures plus `metabase.parameters.params-test/hydrate-param-fields-for-card-test`), because that test uses strict `=` equality and was updated at some later point to expect `:fk_target_field_id`/`:target nil` keys explicitly. This is expected drift — later commits hardened assertions around the fixed behavior — and confirms the revert's blast radius matches the original bug's mechanism rather than indicating an error in the reconstruction.

No ambiguity or blockers encountered. Repo state: working tree in `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-a6169590e53429987` has uncommitted changes to the two files above (left as-is per instructions — no commit/push performed).
