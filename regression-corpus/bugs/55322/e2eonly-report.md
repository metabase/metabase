Task complete. The mutation and witness both work as required.

## 1. git diff (product mutation)

`frontend/src/metabase/reference/segments/SegmentFieldDetail.tsx` (line 156):

```diff
-          reinitializeForm={() => handleReset(undefined)}
+          reinitializeForm={handleReset(undefined)}
```

This is the semantic revert of fix commit `c5d7b5`. The fix commit changed `reinitializeForm={handleReset()}` → `reinitializeForm={handleReset}` in the old `.jsx`. The file has since been converted to `.tsx` and the correct form is now the arrow wrapper `() => handleReset(undefined)`. The mutation reintroduces the exact bug behavior: invoking formik's `handleReset` *during render* instead of passing a function reference.

## 2. Witness

Added `frontend/src/metabase/reference/segments/SegmentFieldDetail.unit.spec.tsx` — a jsdom render test that mounts the connected component with `reference.isEditing = true` (and `isLoading = true` to isolate the edit-header seam without rendering the full body). It asserts the edit-mode render does not throw and the "Cancel" button appears.

Oracle command:
```
bun run test-unit-keep-cljs frontend/src/metabase/reference/segments/SegmentFieldDetail.unit.spec.tsx
```

- PASS on clean HEAD: `✓ renders the edit header without crashing while editing`
- FAIL on mutant: `expect(received).not.toThrow()` — `Error message: "Too many re-renders. React limits the number of renders to prevent an infinite loop."`

The witness is left applied in the worktree alongside the product mutation.

## 3. Bug summary

Calling `handleReset(undefined)` inline in JSX executes formik's reset on every render. Because `useFormik` owns its state inside the very component being rendered, the reset dispatches a formik state update during render, which forces an immediate re-render, which resets again — an infinite loop. React aborts with "Too many re-renders," the error boundary catches it, and the user sees "Something's gone wrong" on the segment field detail page in edit mode (exactly what the e2e repro checks: click Edit, expect no error overlay).

## 4. Outcome

`witness_authored` — the bug is unit-catchable. The render-time infinite-render crash manifests directly in a jsdom React Testing Library render; no real browser, routing, network, or layout geometry is needed. The e2e is replaceable by this jest unit test.

## 5. Confidence

High. The mutation faithfully reproduces the original defect: the fix commit's sole product change was function-reference-vs-invocation of `handleReset` at this exact call site, and the mutation restores the invocation form. The witness discriminates cleanly (a genuine thrown React error, not a compile error): FAIL-on-mutant with the "Too many re-renders" message, PASS-on-clean with the Cancel button present. The only nuance is that the observable is a render-phase throw rather than a pure return value, but React Testing Library surfaces it deterministically at the unit level.