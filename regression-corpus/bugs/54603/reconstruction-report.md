# Reconstruction report — metabase#54603 (FE)

_Verbatim final report from the FE reconstruction agent (a5167b76346d11ed0)._

---

Reconstruction succeeded. Bug metabase#54603 behavior reintroduced with a minimal semantic revert.

## 1. Git diff (product file)
`frontend/src/metabase/dashboard/components/ParameterSidebar/ParameterSidebar.tsx` — `handleRemove` reverted to remove the parameter immediately, bypassing the subscription-check branch that opens the confirm modal:

```
-    if (affectedSubscriptions.length > 0) {
-      setIsRemoveConfirmOpen(true);
-    } else {
-      performRemove();
-    }
-  }, [parameterId, affectedSubscriptions.length, performRemove]);
+    performRemove();
+  }, [parameterId, performRemove]);
```

This is a targeted semantic revert, not `git apply -R`: the subscriptions query, `affectedSubscriptions`, `performRemove`, and the `ConfirmModal` all remain wired in (now unreachable via the warn path), so the file still compiles and lints cleanly. It reproduces the exact pre-fix behavior — "removing a filter with active subscriptions removes it silently, no warning."

## 2. Oracle spec + Tests
Spec: `frontend/src/metabase/dashboard/components/ParameterSidebar/ParameterSidebar.unit.spec.tsx`
- Baseline: `Tests: 10 passed, 10 total`
- Reconstructed: `Tests: 3 failed, 7 passed, 10 total`

Failing (all in the `metabase#54603` describe block, all fix-added):
- warns before removing a parameter used by an active subscription
- removes the parameter when the user confirms in the warning dialog
- does not remove the parameter when the user cancels the warning dialog

The other two subscription tests correctly still pass — they assert immediate removal (no-subscription and archived-only cases), which the bugged behavior also does. This is the right partial-pass signature.

## 3. Failure shape
Assertion failures directly on the fix's contract:
- `expect(removeParameter).not.toHaveBeenCalled()` → "Received number of calls: 1" (removed without confirmation)
- `screen.findByRole("dialog")` → "Unable to find role=\"dialog\"" (the warning modal the fix introduced never renders)

No compile/render crash; the failures are behavioral (missing modal, premature removal).

## 4. Confidence + adversarial reasoning
High confidence. The bug is precisely "no active-subscription warning before filter removal." The single-hunk revert of `handleRemove` restores that behavior while leaving the fix's scaffolding intact — the failing assertions target the added confirmation flow and nothing else. The two immediate-removal tests passing confirms I didn't over-revert (a full revert would still pass those, but the modal-absent failure is exactly the missing-guard behavior, not a broken component). Failure mode is genuine assertion failure, not a mechanical/deletion/arity artifact.

## 5. Ambiguity
None. Clean single-file, single-hunk reconstruction with an assertion-shaped failure on the fix-added tests.
