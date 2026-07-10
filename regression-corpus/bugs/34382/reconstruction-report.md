Reconstruction succeeded. Here is the report.

## 1. `git diff` (the semantic revert)

```diff
diff --git a/frontend/src/metabase/dashboard/reducers.ts b/frontend/src/metabase/dashboard/reducers.ts
     builder
-      .addCase(initialize, (state, { payload: { clearCache = true } = {} }) => {
-        return clearCache ? {} : state;
+      .addCase(initialize, () => {
+        return {};
       })
```

This restores the exact pre-fix behavior: the `draftParameterValues` reducer's `INITIALIZE` handler unconditionally resets to `{}`, ignoring the `clearCache` payload flag.

## 2. Oracle + baseline vs reconstructed

- Oracle: `bun run test-unit-keep-cljs frontend/src/metabase/dashboard/reducers.unit.spec.ts` (shipped spec relocated `.js` -> `.ts`, discriminating assertions survived intact at lines 115 & 139).
- Baseline (product unchanged): `Tests: 18 passed, 18 total`
- Reconstructed (revert applied): `Tests: 1 failed, 17 passed, 18 total`

## 3. Failure shape

The failing test is `INITIALIZE > should return unchanged state if \`clearCache: false\` passed`. Dispatching `INITIALIZE` with `payload: { clearCache: false }` should preserve existing `draftParameterValues` (`{"60bca071": ["Gadget","Doohickey","Gizmo"]}`), but the reverted reducer wipes them to `{}`. Jest `toEqual` diff shows `draftParameterValues` expected populated, received `Object {}`. This is precisely the original bug (dashboard filter state lost when navigating back from the Question view). The sibling test (`clearCache` not passed -> resets) still passes, so the discrimination is clean and specific to the `clearCache:false` branch.

## 4. Confidence + adversarial

Confidence: high. The revert is byte-for-byte the historical pre-fix implementation (`[INITIALIZE]: { next: () => ({}) }` ported into the current RTK `createReducer` form). The commit also removed a `[RESET]: { next: () => ({}) }` handler, but the current `reducers.ts` has no RESET case for `draftParameterValues` and no spec targets it, so it is not part of the discriminating surface — the `clearCache` INITIALIZE branch is the sole behavioral pivot the spec checks. Adversarial: a correct reimplementation preserving state on `clearCache:false` would pass both tests; only the buggy always-clear behavior fails. The rest of the fix commit (typo renames `getisNavigatingBackToDashboard`->`getIsNavigatingBackToDashboard`, `FilterApplyButton` default->named export, comment typo) is non-semantic and untested, correctly excluded from the revert.

## 5. Ambiguity

None material. The `.js`->`.ts` spec relocation is the only relocation; assertions transferred verbatim. Reconstruction is a clean, unambiguous single-line semantic pivot.

Note: the worktree's `reducers.ts` is left in the reverted (failing) state per the reconstruction protocol; it is an isolated worktree and does not affect the main tree.