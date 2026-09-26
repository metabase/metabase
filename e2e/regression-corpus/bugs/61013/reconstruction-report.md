# Reconstruction report — metabase#61013 (FE, partial/all_specs_gone bucket)

_Verbatim report (a4858598b53b5f708)._

---

Reconstruction succeeded. Here is the report.

## Reconstruction: bug metabase#61013 — SUCCESS

**(1) git diff** (minimal semantic revert, 1 line):
```diff
diff --git a/frontend/src/metabase/dashboard/reducers-typed.ts b/frontend/src/metabase/dashboard/reducers-typed.ts
@@ -369,7 +369,7 @@ export const loadingDashCards = createReducer(
           loadingIds,
-          loadingStatus: loadingIds.length > 0 ? "running" : "complete",
+          loadingStatus: loadingIds.length > 0 ? "running" : "idle",
           startTime: loadingIds.length > 0 ? currentTime : null,
```
This reverts exactly the `reducers-typed.ts` hunk of the fix commit — the empty-dashboard case where `FETCH_DASHBOARD_CARD_DATA` fires with zero cards to load.

**(2) Oracle spec + results**
- Oracle: `frontend/src/metabase/dashboard/reducers.unit.spec.ts`, test `"should be complete when the dashboard doesn't have cards to load"` (line 301). This is the surviving, **relocated + renamed** version of the shipped spec: `reducers.unit.spec.js` → `.ts`, and the test was renamed in the fix commit from `"should stay idle with no cards to load"`. The assertion (`loadingStatus: "complete"`) is byte-for-byte the one the fix commit introduced.
- Baseline (HEAD, fixed): `Tests: 18 passed, 18 total`
- Reconstructed (bug reintroduced): `Tests: 1 failed, 17 passed, 18 total`

**(3) failure_shape**: Clean Jest assertion failure — `expect(received).toEqual(expected)` deep-equality diff showing `- "loadingStatus": "complete"` / `+ "loadingStatus": "idle"`. Not a compile or runtime error. Exactly one test fails, and it is the discriminating one.

**(4) Confidence: high.** Adversarial reasoning:
- The reverted line is one of the two product-code hunks in the fix commit, and it is the one with a dedicated unit assertion (the `DashboardApp.tsx`/`context.tsx` hunks — `onLoad`→`onLoadWithoutCards`, `push`→`replace`, removal of the `dashcards.length === 0` special case — are only covered by the Cypress e2e specs, the "real oracle" for the full UX symptom).
- Failure is a value assertion, not a type/compile break — `"idle"` is still a valid `loadingStatus` union member, so TS compiles; the test discriminates purely on runtime behavior.
- Precisely 1/18 tests flips; the other 17 (running state, loading-finished, dedup, cancellation) stay green, confirming the revert is surgical and the oracle isolates the empty-dashboard loading-state semantics.

**(5) Ambiguity**: The full bug (empty multi-tab dashboard never firing `onLoad`, so the "add card" flow mis-saved / stayed in a stuck loading state) is a UI-level symptom whose complete oracle is the Cypress spec `e2e/.../dashboard-reproductions.cy.spec.js` ("issue 61013"). However, the root-cause reducer change (`loadingStatus` never reaching a terminal state for cardless dashboards) **does** have a surviving discriminating jest unit oracle, which this reconstruction exercises. Category if one insisted on the FE-app-level behavior: `no_unit_oracle__real_oracle_cypress` for the `DashboardApp`/`context` hunks — but that qualifier does not apply here because a valid unit oracle exists for the reducer hunk. Reconstruction is not failed; it succeeds via the reducer oracle.
