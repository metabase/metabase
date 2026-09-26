Reconstruction complete. Diff left in place in the worktree. Final report below.

---

## 1. git diff — the semantic revert

```diff
diff --git a/frontend/src/metabase/metadata/components/SemanticTypePicker/utils.ts b/frontend/src/metabase/metadata/components/SemanticTypePicker/utils.ts
@@ getCompatibleSemanticTypes(...)
-  const fieldType = field.effective_type ?? field.base_type;
+  const fieldType = field.base_type;
```

Fix commit `a5343da` was a large "use the new SemanticTypePicker everywhere" PR (#55539) whose central behavioral theme — repeated across its commit log ("Use effective type", "Add test for base_type fallback") — was making the compatible-semantic-type filter key off the field's `effective_type` (falling back to `base_type`). The mutation reintroduces the pre-fix behavior: the filter ignores `effective_type` and keys only off `base_type`. This is a semantic revert of the drifted product code (the function was extracted/relocated by this same commit), not a `git apply -R`.

## 2. Oracle

- Spec: `frontend/src/metabase/metadata/components/SemanticTypePicker/SemanticTypePicker.unit.spec.tsx`
- Command (from worktree root, cljs + node_modules symlinked): `bun run test-unit-keep-cljs frontend/src/metabase/metadata/components/SemanticTypePicker/SemanticTypePicker.unit.spec.tsx`
- Baseline (clean HEAD): **PASS** — Tests: 23 passed, 23 total.
- Reconstructed (mutation applied): **FAIL** — Tests: 1 failed, 22 passed, 23 total.

Oracle relocation: the spec shipped by the fix moved from `.../admin/datamodel/metadata/components/SemanticTypeAndTargetPicker/SemanticTypePicker/SemanticTypePicker.unit.spec.tsx` to the new top-level module `frontend/src/metabase/metadata/components/SemanticTypePicker/` (a pure rename in the same commit; this is the surviving descendant).

## 3. failure_shape

- Failing test: `SemanticTypePicker › uses field's effective_type when it is available`
- Assertion: `TestingLibraryElementError: Unable to find an element with the text: Title` at `expect(dropdown.getByText("Title")).toBeInTheDocument()`.
- Why: the test field has `base_type: type/DateTime`, `effective_type: type/Text`. Correct code keys off `effective_type` (Text) → dropdown offers `Title` (and hides temporal types). The mutation keys off `base_type` (DateTime) → dropdown offers temporal types (`Birthday`, `Creation date`) and omits `Title`. Clean DOM mismatch, not a compile/import error.

## 4. Confidence + adversarial

High confidence the failure isolates the reverted behavior. Only **1** of 23 tests flips; the other 22 stay green. Crucially, the sibling test `falls back to using field's base_type if effective_type is not available` (base DateTime, effective `undefined`) stays **green** — under the mutation `field.base_type` still yields DateTime there, so its expectations (`Birthday`, `Creation date` visible; `Title` hidden) are unchanged. That green sibling proves the failure is specifically the loss of `effective_type` precedence, not a blunt neutralization of the whole filter. The JSON/boolean/deprecated/Entity-Name tests also stay green because their mock fields' `base_type` and `effective_type` derive to the same level-one type, so only the one field that deliberately diverges (base≠effective) discriminates.

## 5. Outcome

**kill** (oracle relocated: shipped spec renamed into the new `metabase/metadata/components/SemanticTypePicker/` module). The surviving unit spec catches the regression as a clean value/DOM assertion.

Note on class `partial`: the literally-named issues #55617/#55618 in the commit are FK-target-mapping regressions in the reference views, protected by the new `reproductions.cy.spec.ts` Cypress tests (e2e-only). But the same commit's compatible-semantic-type filtering logic is unit-covered by this spec, and a behavioral revert of its core `effective_type` handling produces a clean jest kill — so this target is closable at the unit level (already covered; no new test needed).