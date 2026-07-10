The reconstruction is complete. Here is the final report.

---

## 1. git diff — semantic revert

```diff
diff --git a/frontend/src/metabase/common/components/Pickers/MiniPicker/utils.ts
@@ -294,6 +294,7 @@ export function getFolderAndHiddenFunctions(
     return (
+      item.model !== "metric" &&
       !modelSet.has(item.model as MiniPickerPickableItem["model"]) &&
       !isFolder(item)
     );
```

Single-line change to `getFolderAndHiddenFunctions`'s `isHidden` predicate in the MiniPicker. It exempts `metric` items from the pickable-model filter, so metrics render (and are selectable) even when the caller's `models` set excludes them — i.e. metrics show up as valid join targets in the entity/mini picker, which is precisely bug **66210** ("Metrics should not be a valid join target for joins in the entity picker").

## 2. Oracle

- **Spec:** `frontend/src/metabase/common/components/Pickers/MiniPicker/components/MiniPicker/test/oss.unit.spec.tsx`
- **Command:** `bun run test-unit-keep-cljs <spec>` (run from worktree root, with `target`/`node_modules` symlinked from the main tree)
- **Baseline (clean HEAD):** PASS — Tests: 27 passed / 27 total
- **Reconstructed (mutation applied):** FAIL — Tests: 1 failed, 26 passed / 27 total

Oracle relocation note: the fix commit shipped `.../MiniPicker/components/MiniPicker.unit.spec.tsx` (437 lines added). It has since been split/relocated to a co-located `test/` dir as `oss.unit.spec.tsx` + `ee.unit.spec.tsx`. The discriminating assertion for 66210 is the surviving descendant `test/oss.unit.spec.tsx`. The product logic also moved: `MiniPicker/utils.ts` `getFolderAndHiddenFunctions` is the current home of the "hide items whose model isn't pickable" rule.

## 3. failure_shape

- **Test:** `MiniPicker › collections › ignores metrics when the model is missing`
- **Assertion:** `expect(screen.queryByText("Catherine")).not.toBeInTheDocument()` — the test sets `models: ["table", "dataset", "card"]` (no `metric`) and expects the metric "Catherine" to be filtered out.
- **Mismatch:** expected the document NOT to contain "Catherine"; received a rendered `<div>…Catherine</div>` — the metric leaked into the list because the mutation stops `isHidden` from suppressing metric items.

## 4. Confidence + adversarial

High confidence the failure isolates the reverted behavior. Only the single metric-filtering test flips; all 26 siblings stay green, including the ones that pin the surrounding mechanism:
- `can pick a metric` (metric still selectable when `metric` IS in `models`) — green, so the change didn't break the metric happy-path.
- `ignores documents` (a different non-pickable model, `document`, still filtered) — green, proving the general model-filter still works and the break is metric-specific, not a blunt "disable all filtering."
- All `search`, `tables`, `schemas` groups green.

The mutation is a clean value/DOM mismatch, not a compile/import error, and the failing test is a behavioral descendant of the spec the fix commit shipped.

## 5. Outcome

**kill** (with oracle relocation noted). Within this large "Data Studio (#65281)" refactor, the load-bearing product change for 66210 — amid otherwise mechanical churn — is the new MiniPicker's model-based `isHidden`/`isFolder` filtering (`getFolderAndHiddenFunctions` in `MiniPicker/utils.ts`, corresponding to the commit's "properly disable invalid items in MiniPicker" / "fix minipicker shows items it should not show" work). Its surviving discriminating jest coverage is `test/oss.unit.spec.tsx › ignores metrics when the model is missing`, which cleanly catches the reintroduced bug. This target is already closed by an existing unit test — no new test needed.

(Note: the corpus association of 66210 to this commit is partial/fuzzy — the message never cites 66210 and the canonical fix is the later `#67490`. But this commit does carry genuine, surviving jest regression protection for the exact 66210 behavior, so the honest outcome is a kill, not `cypress_only`.)

The mutation is left in place in the worktree for diff capture.