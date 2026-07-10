The reconstruction is complete and the oracle flips cleanly. Here is the final report.

---

## 1. git diff — the semantic revert

```diff
diff --git a/frontend/src/metabase/querying/common/components/DataSelector/DataSelector.jsx
--- a/.../DataSelector/DataSelector.jsx
+++ b/.../DataSelector/DataSelector.jsx
@@ -464,7 +464,7 @@ export class UnconnectedDataSelector extends Component {
   isSearchLoading = () => {
-    return this.props.loading;
+    return this.props.allLoading;
   };
```

The fix (#55995, commit `103a64f`) rewrote `isSearchLoading` from the pre-fix `models == null || metrics == null || allLoading` to the consolidated single-search signal `this.props.loading`. The regression this guards is that the component must key its loading indicator off the new `loading` prop. My one-line revert re-binds it to the old `allLoading` prop, reintroducing the "component ignores the consolidated loading signal" behavior at the heart of the sync-loop blinking bug. I chose `allLoading` (surgical) over the literal old `models==null||metrics==null||allLoading` formula because those props no longer exist / aren't passed, so the literal formula would evaluate `undefined == null → true` and force loading everywhere — a blunt break tripping ~all tests rather than isolating the fixed behavior.

## 2. Oracle

- Spec (relocated): `frontend/src/metabase/querying/common/components/DataSelector/DataSelector.unit.spec.js`
  (moved from `query_builder/components/DataSelector/` → `querying/common/components/DataSelector/`; still `.js`, imports `UnconnectedDataSelector` directly so the Search HOC is bypassed and the `loading` prop is passed explicitly.)
- Command: `bun run test-unit-keep-cljs frontend/src/metabase/querying/common/components/DataSelector/DataSelector.unit.spec.js`
- Baseline (clean HEAD): PASS — Tests: 17 passed, 17 total.
- Reconstructed (bug applied): FAIL — Tests: 1 failed, 16 passed, 17 total.

## 3. failure_shape

- Failing test: `DataSelector › should fetch db, schema, and table progressively`
- Assertion (spec line 173): after `rerender(<DataSelector {...props} loading />)`, `expect(screen.getByTestId("loading-indicator")).toBeInTheDocument()`
- Mismatch: `TestingLibraryElementError: Unable to find an element by: [data-testid="loading-indicator"]`. Expected the loading indicator present (from `loading` prop); received the empty-state / picker DOM because `isSearchLoading()` now reads the unset `allLoading` prop and returns `undefined` (falsy). Clean DOM assertion, not a compile/import error.

## 4. Confidence + adversarial

High confidence the failure isolates the reverted behavior. Only the one test that exercises the `loading` prop fails; all 16 siblings stay green — including `should allow selecting db, schema, and table` and the two `Saved Questions` tests (which pass `availableModels` and exercise `hasModels`/`hasMetrics`, code paths untouched by this revert). No test passes `allLoading`, so re-binding to it doesn't spuriously flip any other case; every other render leaves both `loading` and `allLoading` unset, so `isSearchLoading()` is falsy in both clean and reverted worlds — identical behavior there. The single delta is precisely the `loading`-prop assertion, confirming the discrimination is behavioral, not a blunt break.

## 5. Outcome

`kill` — the surviving jest spec (relocated `query_builder/…` → `querying/common/…`, still `DataSelector.unit.spec.js`) discriminates the fix. A unit test already covers the regression (the `loading`-prop → `loading-indicator` assertion), so this bug class is closable at the unit level; no Cypress-only hole here. The worktree diff is left in place for capture.