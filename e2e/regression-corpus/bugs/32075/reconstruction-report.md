The reconstruction is complete and the diff is left in the worktree. Here is the final report.

## 1. git diff — the semantic revert

`frontend/src/metabase-lib/v1/Question.ts`, in `maybeResetDisplay`:

```diff
     const shouldUnlock = wasSensible && !isSensible;
-    const defaultDisplay = this.setDefaultDisplay().display();
 
     let question;
-    if (isSensible && defaultDisplay === "table") {
-      // any sensible display is better than the default table display
-      question = this;
-    } else if (shouldUnlock && this.displayIsLocked()) {
+    if (shouldUnlock && this.displayIsLocked()) {
       question = this.setDisplayIsLocked(false).setDefaultDisplay();
     } else {
       question = this.setDefaultDisplay();
```

This removes the fix's core guard ("any sensible display is better than the default table display"). With it gone, a non-locked question whose current display is sensible (e.g. `scalar`) falls into the `else` branch and gets reset to the default `table` display — exactly the #32075 bug (a summarized field's user-chosen visualization gets clobbered back to table after adding a filter).

## 2. Oracle

- Spec (relocated descendant of the shipped `frontend/test/metabase-lib/lib/Question.unit.spec.js`): `frontend/src/metabase-lib/v1/Question.unit.spec.js`
- Product logic relocated: `frontend/src/metabase-lib/Question.ts` → `frontend/src/metabase-lib/v1/Question.ts` (signature also drifted: `maybeResetDisplay(data, sensibleDisplays, previousSensibleDisplays)` now takes `data` first and folds in the scalar-switch).
- Command (from worktree root): `bun run test-unit-keep-cljs frontend/src/metabase-lib/v1/Question.unit.spec.js`
- Baseline (clean HEAD): Tests: 55 passed, 55 total
- Reconstructed (mutation applied): Tests: 2 failed, 53 passed, 55 total

## 3. failure_shape

- `maybeResetDisplay › should keep any sensible display when display was not locked (metabase#32075)` — `expect(question.display()).not.toBe("table")`: Expected not "table", Received "table". This is the test explicitly tagged with the issue id.
- `setDefaultDisplay › should not set the display to scalar if another scalar display was selected and display is locked` — `expect(question.display()).toBe("gauge")`: Expected "gauge", Received "scalar" (once the guard is removed, the non-locked `gauge` question resets to default `table`, then `_maybeSwitchToScalar` flips the 1×1 data to `scalar`).

Both are clean value-mismatch assertions, not compile/import errors.

## 4. Confidence + adversarial

High confidence the failure isolates the reverted behavior. The two failing tests are precisely the ones whose current display is sensible but where the default would be `table` — the only path the removed guard governs. The sibling `maybeResetDisplay` tests stay green because they don't depend on that guard:
- "locked with sensible/nonsense display" (stay because of the lock, not the guard),
- "use default display when nonsense display… not locked" (nonsense display, guard never applied),
- "unlock and use new sensible display…" (goes through the `shouldUnlock` branch),
- "keep any sensible display when display was locked" (locked ⇒ `setDefaultDisplay` is a no-op),
- "switch to scalar display for 1x1 data" (driven by `_maybeSwitchToScalar`, unaffected).

The whole 53-pass remainder of the suite is untouched, confirming this is a surgical semantic revert, not a blunt break.

## 5. Outcome

`kill`. The shipped jest regression test survived a relocation (`frontend/test/metabase-lib/lib/…` → co-located `frontend/src/metabase-lib/v1/Question.unit.spec.js`) plus a method-signature refactor, and it still discriminates the bug: the `(metabase#32075)`-tagged assertion flips from pass to fail under a minimal semantic reintroduction. Note the corpus class label `all_specs_gone` is inaccurate for this target — the discriminating jest spec is present and effective. No new unit test needed; the existing oracle already closes the hole.