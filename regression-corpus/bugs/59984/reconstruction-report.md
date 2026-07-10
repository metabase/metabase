# Reconstruction report — metabase#59984 (FE)

_Verbatim final report from the FE reconstruction agent (a3f89783de6a5206d)._

---

Reconstruction complete and verified.

## 1. Diff (`frontend/src/metabase/visualizations/lib/map.ts`)
Removed the x-ray auto-dashboard handling block inside `getTileUrl`'s `if (isDashboard)` branch:
```diff
-    // isAutoDashboard
-    if (typeof dashboardId === "string" && dashboardId.startsWith("/auto")) {
-      return adhocQueryTileUrl(zoom, coord, latField, lonField, datasetQuery);
-    }
-
-    if (
-      typeof dashboardId === "string" &&
-      !isUuid(dashboardId) && // public dashboard
-      !isJWT(dashboardId) // embedded dashboard
-    ) {
-      throw new Error("dashboardId must be an int, an uuid or a jwt");
-    }
-
```
A string `dashboardId` like `"/auto/dashboard/table/5"` now falls through to `dashboardTileUrl`, producing the original malformed URL — exactly bug #59984's pre-fix behavior.

## 2. Oracle spec + results
Spec: `frontend/src/metabase/visualizations/lib/map.unit.spec.ts`
- Baseline: `Tests: 18 passed, 18 total`
- Reconstructed: `Tests: 1 failed, 17 passed, 18 total`

The single failure is the fix-added assertion `dashboard › should handle an x-ray dashboard`.

## 3. failure_shape
Clean `expect(url).toBe(...)` assertion mismatch (not a throw/compile error):
- Expected: `/api/tiles/{z}/{x}/{y}?query=...&latField=latitude&lonField=longitude`
- Received: `/api/tiles//auto/dashboard/table/5/dashcard/20/card/30/{z}/{x}/{y}?latField=latitude&lonField=longitude`

The received value is the genuine buggy malformed tile URL, confirming behavioral (not mechanical) reconstruction.

## 4. Confidence + adversarial reasoning
High confidence.
- Precisely one fix-added assertion fails; the other 17 (adhoc/saved/dashboard-int/public/embed) still pass, so no collateral damage.
- The failure is a value mismatch reproducing the actual defect (dashboardId string interpolated into a path where it can't be), not an incidental throw or arity error.
- Both removed `if` blocks were introduced by the fix commit (the guard later drifted to the uuid/jwt form); removing them restores the exact pre-fix fall-through. Public/embed dashboard tests still pass because they set `uuid`/`token`, short-circuiting before `dashboardTileUrl`.
- Note: `isUuid`/`isJWT` imports are now unused. This does not affect the jest oracle (it passed the other 17 and compiled), and I left them to keep the diff minimal and focused on the behavioral revert.

## 5. Ambiguity
None significant. The fix touched three files, but the only unit oracle assertion is the x-ray test in `map.ts`'s `getTileUrl`; the `LeafletTilePinMap.jsx` `stringifyFieldRef` change (base-type stripping) is covered only by the Cypress spec, not this unit oracle, so it was correctly out of scope for this reconstruction.
