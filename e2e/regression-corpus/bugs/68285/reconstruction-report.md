# Reconstruction report — metabase#68285 (FE)

_Verbatim final report from the worktree-isolated FE reconstruction agent (a3451b31205536b1d)._

---

Reconstruction succeeded.

## Report

**1. `git diff`** (product file only):
```diff
--- a/frontend/src/metabase/embedding/embedding-iframe-sdk-setup/utils/get-default-sdk-iframe-embed-setting.ts
+++ b/frontend/src/metabase/embedding/embedding-iframe-sdk-setup/utils/get-default-sdk-iframe-embed-setting.ts
@@ -64,7 +64,6 @@ export const getDefaultSdkIframeEmbedSettings = ({
         withAlerts: false,
         withTitle: true,
         isSaveEnabled: false,
-        initialSqlParameters: {},
       }),
     )
     .with(
```

**2. Oracle spec + results**
- Spec: `frontend/src/metabase/embedding/embedding-iframe-sdk-setup/utils/get-default-sdk-iframe-embed-setting.unit.spec.ts`
- Baseline: `Tests: 20 passed, 20 total`
- Reconstructed: `Tests: 1 failed, 19 passed, 20 total`
- Failing assertion: `getDefaultSdkIframeEmbedSettings › chart experience › returns correct component name and properties` — the `expect(result).toMatchObject({...expectedProps})` at spec line 75, where the chart case's `expectedProps` (lines 40-47) includes `initialSqlParameters: {}`. This is exactly the property the fix commit added to both product and spec.

**3. Failure shape**: Genuine assertion failure — `toMatchObject` diff shows `- "initialSqlParameters": Object {}` missing from the received object. Not a compile/type error, not a thrown exception.

**4. Confidence: high.** Adversarial reasoning: The fix commit `dd00b335` made exactly two source changes — adding `initialSqlParameters: {}` to the "chart" branch of the product file, and adding the matching key to the spec's chart `expectedProps`. My revert removes only that one property from the product file, semantically reintroducing the original bug ("tracking event / default never set in embed" — the chart experience's default settings omit `initialSqlParameters`). The behavior is restored, not the fix reverted mechanically — I edited the product file, not the test. Only the chart-experience assertion fails; the other 19 tests (including the other four experiences that never had this property) remain green, confirming the failure is localized to the fix's exact behavioral surface. This is not a deletion/arity/moved-target/neutralizing degenerate case.

**5. Ambiguity**: None. Single-property, single-branch fix with a directly corresponding oracle assertion.
