The reader error is just the auto-resolved keyword `::parameters.schema/...` not being resolvable outside the namespace context — not a defect in my edit (a simple `let`-binding change). The mutation is trivially valid Clojure.

I have everything needed. Here is my report.

---

## 1. git diff (product mutation)

`src/metabase/parameters/params.clj` — semantic revert of the fix. `find-card-for-mapping` no longer resolves the card that a parameter mapping actually points at (via `:card_id` across the primary card **and** the dashcard's `:series` cards); it always returns the primary `(:card dashcard)`:

```diff
 (defn- find-card-for-mapping
   "Find the card that a parameter mapping refers to. ..."
-  [dashcard mapping]
-  (let [card (if-let [card-id (:card_id mapping)]
-               (or (m/find-first #(= (:id %) card-id)
-                                 (cons (:card dashcard) (:series dashcard)))
-                   (:card dashcard))
-               (:card dashcard))]
+  [dashcard _mapping]
+  (let [card (:card dashcard)]
     (cond-> card
       (string? (:type card))          (update :type keyword)
       (seq (:dataset_query card))     (update :dataset_query lib-be/normalize-query))))
```

This single seam feeds both call sites the fix touched (`dashcards->param-id->field-ids*` and `dashboard-param->field-ids`, both now routed through `mapping->param-dashcard-info` → `find-card-for-mapping`), so the one-point revert fully reintroduces the behavior. `medley` (`m`) is still used elsewhere in the file (lines 113/166/171/261), so the mutant compiles with no unused-require. The `[:dashcards :card :series]` hydration was left intact — harmless, since resolution now ignores `:series` regardless.

## 2. Witness

**none — the buggy computation lives entirely in Clojure backend code; there is no JS module to assert on.**

- Oracle harness (`bun run test-unit-keep-cljs <spec>`) runs jest against JS/TS. The mutation is in Clojure server code, so no jest test can execute the mutated code path — a witness is structurally impossible, not merely hard.
- I verified the closest frontend seam, `frontend/src/metabase/parameters/utils/dashboards.ts`. Its `getMappings` (lines 114-118) already correctly resolves the mapped card by `card_id` across `[card, ...series]`, and `buildSavedDashboardParameter` (lines ~208-227) derives a parameter's fields purely from `fields?.[parameter.id]` — i.e. `Dashboard["param_fields"]`, an **opaque server-computed input**. That `param_fields` map is exactly the output my Clojure mutation corrupts. A jest test would hand `param_fields` to the FE directly, so it cannot observe the backend's mis-resolution. The FE side was already correct before and after the fix (the fix commit touched no FE files).

## 3. Bug summary

On a dashboard where one dashcard combines cards from **multiple datasources** (a primary card plus `:series` cards, e.g. a visualizer card with a Sample-DB card and a Postgres card), a category/text filter is mapped to a field on one of the *series* cards. With the mutation, `param_fields` resolves the parameter's field-ids only against the **primary** card, so the field belonging to the series card (e.g. Postgres `PRODUCTS.CATEGORY`, field 1552) is dropped. The filter's value dropdown is then populated from the wrong/incomplete field set, so a value that exists only in the series card's datasource (the e2e's `"New Category"`) never appears. The e2e (`metabase#68998`) asserts `"New Category"` shows up in the filter popover.

## 4. Outcome

**`no_witness`** — irreducibly backend. Class: **server-computed value / real-network** (from the frontend's vantage the corrupted `param_fields` arrives over the dashboard API; the buggy field-id resolution has no JavaScript equivalent). The e2e is genuinely load-bearing because reproducing it requires the backend hydration + `param_target->field-id` resolution against real series cards from two databases.

## 5. Confidence

**High** on the mutation faithfully reintroducing the bug: it is the exact inverse of the fix's core mechanism (card lookup for a mapping) at the one seam both fixed call sites funnel through; the pre-fix code likewise used only `(:card dashcard)`. **High** on `no_witness`: the fix commit changed only `params.clj` + the e2e spec (zero FE product code), and the one plausible FE seam consumes the backend's `param_fields` as opaque data rather than recomputing field-ids, so no jest assertion can discriminate clean HEAD from the mutant.

Mutation left applied in the worktree at `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-ac160c0e143b6f9fb/src/metabase/parameters/params.clj`.