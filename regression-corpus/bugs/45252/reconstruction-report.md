# Reconstruction report — metabase#45252

_Verbatim final report from the worktree-isolated reconstruction agent (ae54eb9acc6cbb7ce)._

---

## Reconstruction result: `reconstruction_failed`

I stopped after localization rather than thrash — the target no longer exists in the tree. Here is the honest picture.

### What the 2024 fix did (commit 96e60529)
Product file `src/metabase/lib/filter/operator.cljc` held a runtime `filter-operators` dispatch (`condp lib.types.isa/field-type? column ...`) returning per-type operator lists. The fix removed `:is-null`/`:not-null` from `text-operators` / `text-like-operators`, dropped `location-operators` and `key-operators-for`, and changed `default-operators` to the empty/`is-null→is-empty` fallback. The oracle `filterable-columns-test` (then in `test/metabase/lib/filter_test.cljc`) had its expected `text-operators` vector and the `"NAME"` column's operator map edited to drop `"is-null"`.

### Why it can't be reconstructed against current master
The entire operator-list feature was deleted by commit **e10dfc7cfc7 "Extract UI components for QB filter widgets (#69051)"** (July 2025), which moved operator selection to the frontend:

- `src/metabase/lib/filter/operator.cljc` — **deleted** (177 lines removed; confirmed no `operator.cljc` anywhere under `src/`, `enterprise/`).
- The product function `filter-operators` — **gone**. No `defn`/`def filter-operators` exists in `src/` or `enterprise/`. What remains in `filter.cljc` is only `describe-filter-operator` (a display-name helper), and `src/metabase/lib/schema/filter.cljc` holds static Malli enums (`::string-filter-operator`, `::default-filter-operator`), not runtime dispatch.
- The oracle `filterable-columns-test` at `test/metabase/lib/filter_test.cljc:218-248` was **rewritten**. It now asserts only `:lib/desired-column-alias` column names — it contains **zero** operator / `is-null` / `is-empty` assertions. The same refactor deleted the sibling `filter-operators-test` and all `lib.filter.operator/filter-operators` call sites in the test file.

### Conclusion
The specific FIX-ADDED assertions (removing `:is-null`/`:not-null` from the text-column operator list) no longer exist in `filterable-columns-test`, and there is no product code (`operator.cljc` / `filter-operators`) to apply a minimal semantic revert to. A baseline run is therefore meaningless (nothing to target) and no product edit could make a non-existent assertion fail. This is a genuine dead-target case, not an ambiguity I could resolve with more probing.

### Adversarial self-check
- Could the oracle be a different ns? The task fixes the deftest name `filterable-columns-test`; the only match is `test/metabase/lib/filter_test.cljc:218`, and it no longer tests operators. `fe_util_test.cljc` has an `all-filter-operators` local but that is a test-local literal, not the product fn.
- Could semantics have merely moved (so a different file is the real target)? The runtime logic moved to frontend TypeScript (`frontend/src/metabase/querying/.../FilterPicker/...`); the backend retains only schema enums. Neither is `operator.cljc` nor is either exercised by `filterable-columns-test`. Retargeting would violate the "minimal semantic revert of the named product file / oracle" constraint.

Relevant paths:
- Deleted product file (historical): `src/metabase/lib/filter/operator.cljc`
- Current oracle (operator assertions absent): `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-ae54eb9acc6cbb7ce/test/metabase/lib/filter_test.cljc:218`
- Refactor that removed the target: commit `e10dfc7cfc7`
- Surviving schema-only remnant: `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-ae54eb9acc6cbb7ce/src/metabase/lib/schema/filter.cljc:36-44`

Confidence: high that reconstruction is impossible on this HEAD.
