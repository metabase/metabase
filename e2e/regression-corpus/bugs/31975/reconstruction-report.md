The reconstruction succeeded. Here is the final report.

---

## 1. git diff (semantic revert)

Left in the worktree at `frontend/src/metabase/parameters/components/widgets/TextWidget/TextWidget.tsx`:

```diff
         onBlur={() => {
           changeFocus(false);
-          if (this.state.value !== this.props.value) {
-            setValue(this.state.value ?? null);
-          }
+          this.setState({ value: this.props.value });
         }}
```

This restores the pre-fix `onBlur` behavior: instead of committing the edited value via `setValue`, it discards the typed value by resetting local state back to `this.props.value`. It is the exact behavioral inverse of the fix commit's `TextWidget.tsx` change (the fix's "Save value on blur" hunk).

## 2. Oracle

- Spec: `frontend/src/metabase/parameters/components/widgets/TextWidget/TextWidget.unit.spec.tsx`
- Command (from worktree root): `bun run test-unit-keep-cljs frontend/src/metabase/parameters/components/widgets/TextWidget/TextWidget.unit.spec.tsx`
- Baseline (clean HEAD): PASS — Tests: 7 passed, 7 total.
- Reconstructed (bug applied): FAIL — Tests: 2 failed, 5 passed, 7 total.

Oracle relocation: the shipped component `frontend/src/metabase/components/TextWidget/` was moved to `frontend/src/metabase/parameters/components/widgets/TextWidget/`; the colocated `TextWidget.unit.spec.tsx` is the surviving descendant of the fix's shipped spec.

## 3. failure_shape

Two clean value/behavior assertion failures (no compile/import errors):

- `should keep zero value when pressing enter`: `expect(element).toHaveValue("0")` — Expected `0`, Received `` (empty). Enter now only blurs; with the buggy onBlur the typed `0` is thrown away and state resets to the empty prop.
- `should not call setValue twice when pressing enter`: `expect(onChangeSpy).toHaveBeenCalledTimes(1)` — Expected 1 call, Received 0. Because `setValue` fires from `onBlur` (not from the Enter handler), suppressing the onBlur save drops the call entirely.

## 4. Confidence + adversarial

High confidence this isolates the reverted behavior. The Enter keypath in current code only calls `target.blur()`; the actual value commit happens in `onBlur`, so the two failing tests directly probe the blur-save logic. The five sibling tests stay green, confirming it is not a blunt break:
- `should render correctly`, `should render a zero as an initial value`, `should accept editing`, `should accept zero as an input value` — all exercise render/onChange, not blur.
- `should not call handlers when pressing esc` — esc never blurs, so it is unaffected.

Only the two blur-dependent assertions flip, which is the discriminating signature of this specific fix.

## 5. Outcome

`kill` — the surviving relocated jest spec (`components/TextWidget` → `parameters/components/widgets/TextWidget`) catches the regression as a clean value/call-count assertion, no new test needed. Note the fix commit's own jest edits were non-discriminating (default→named import rename); the discriminating coverage comes from the `0{enter}` blur-save tests that live in the current descendant spec, which the relocated component still exercises.