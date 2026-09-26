# Reconstruction report — metabase#62053

_Verbatim final report from the worktree-isolated reconstruction agent (a216069a4e8f46ab8)._

---

Both regression tests pass cleanly (3 assertions, 0 failures) — the reconstruction is properly scoped to only the deduplication behavior. All verification is complete.

## Report

**1. Reconstruction diff** (`src/metabase/channel/render/body.clj`):

```diff
 (defn- order-data [data viz-settings]
   (if (some? (::mb.viz/table-columns viz-settings))
-    (let [;; Deduplicate table-columns by name to handle duplicated viz settings
-          deduped-table-columns       (->> (::mb.viz/table-columns viz-settings)
-                                           (m/distinct-by ::mb.viz/table-column-name))
-          deduped-viz-settings        (assoc viz-settings ::mb.viz/table-columns deduped-table-columns)
-          [ordered-cols output-order] (qp.streaming/order-cols (:cols data) deduped-viz-settings)
+    (let [[ordered-cols output-order] (qp.streaming/order-cols (:cols data) viz-settings)
           ;; table-columns from viz-settings only includes remapped columns, not the source columns
           santized-ordered-cols       (map #(dissoc % :remapped_from :remapped_to) ordered-cols)
           keep-filtered-idx           (fn [row] (if output-order
```

Note: current code had drifted from the original fix — an intermediate commit ("fixup! use linear time deduplication") replaced `(m/index-by ::mb.viz/table-column-name) vals` with the equivalent-but-differently-implemented `(m/distinct-by ::mb.viz/table-column-name)`. This is why `git apply -R` on the original commit no longer applies. Also unrelated later code (the `santized-ordered-cols` dissoc step for remapped columns) sits in the same `let`, so I removed only the dedup bindings and fed `viz-settings` straight into `qp.streaming/order-cols`, leaving everything else untouched.

**2. Oracle test**: `metabase.channel.render.body-test/order-data-handles-duplicated-table-columns-test` (test/metabase/channel/render/body_test.clj:1278)
- Baseline (pre-edit): 6 assertions, 0 failures, 0 errors — PASS.
- Reconstructed (post-edit): 6 assertions, 2 pass / 4 fail, 0 errors — FAIL as assertion mismatches, namespace loaded/compiled fine.

**3. Failure shape**
- Symptom: duplicated `table-columns` viz-settings entries (same `table-column-name` appearing twice) cause `qp.streaming/order-cols` to emit the column/index twice, so rendered table output gets a duplicate column and duplicated cell values instead of deduping to one.
- Repro failure (actual output from test run):
  - `expected: 2 cols, actual: 3` (second col slot is `"ID"` where `"NAME"` was expected)
  - `expected: [1 "Alice"], actual: (1 1 "Alice")`
  - `expected: [2 "Bob"], actual: (2 2 "Bob")`

**4. Confidence: high.** Adversarial check performed:
- Confirmed `medley.core` (`m`) require is still used elsewhere in the file (lines 301, 350, 453, 721), so removing the `m/distinct-by` call doesn't leave a dangling/unused import or break compilation.
- Traced into `metabase.query_processor.streaming/order-cols` and `export-column-order` to confirm the mechanism: duplicate enabled `table-columns` entries with the same name independently resolve to the same `cols-index` lookup and both survive into `output-order`, producing the duplicate column/row — this matches the original bug description and PR title ("duplicated table column viz settings").
- Ran the two adjacent/neighboring tests (`order-data-respect-table-columns-order-test`, `render-table-with-remapped-with-custom-columns-order-test`) — both still pass (3 assertions, 0 failures), confirming the reconstruction is scoped strictly to the duplicate-handling regression and doesn't collaterally break column ordering or remapped-column handling.

**5. Ambiguity**: none of note — the fix commit's diff hunk was small and self-contained, and the only drift was the dedup implementation swap (`index-by`+`vals` → `distinct-by`), which is semantically identical, so "undoing" it by deleting the dedup step entirely is unambiguous.

Files touched: `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-a216069a4e8f46ab8/src/metabase/channel/render/body.clj`
