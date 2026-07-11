Both the product mutation and the witness are in the worktree. Here is the report.

---

## 1. git diff (product mutation)

The fix commit `6e3aca9` touched two product files. The `context.tsx` change (`initialValues={{ ...initialValues }}` → `initialValues={initialValues}`, plus an `enableReinitialize` flag) is a render-timing concern that has since been superseded by an unrelated refactor (`FormValuesPatcher`, `useMemo`-stabilized `initialValues`, no more `enableReinitialize`). The **pure seam** is the `util.ts` change to `getName`. Semantic revert applied to current code:

`frontend/src/metabase/common/components/SaveQuestionForm/util.ts` (`getName`, ad-hoc branch):
```diff
   // Ad-hoc query
-  return question.displayName() || question.generateQueryDescription() || "";
+  return question.generateQueryDescription() || "";
```
This reintroduces the pre-fix behavior: for a new (ad-hoc) question, the name is derived from the auto-generated query description, ignoring the question's actual display name.

## 2. Witness

Added to `frontend/src/metabase/common/components/SaveQuestionForm/util.unit.spec.ts` (new test in the `getInitialValues` block, keyed to `metabase#55631`). It builds a new ad-hoc `Question` whose display name is `"Custom"` (the name the user typed, carried by the in-flight question during save) while its `generateQueryDescription()` is `"Table 1"`, then asserts:
```ts
const result = getInitialValues(null, savedQuestion, 1, null);
expect(result.name).toBe("Custom");
```

Oracle command:
`bun run test-unit-keep-cljs frontend/src/metabase/common/components/SaveQuestionForm/util.unit.spec.ts -t "55631"`

- **PASS on clean HEAD**: `result.name` = `"Custom"`.
- **FAIL on mutant**: `Expected: "Custom" / Received: "Table 1"` at `expect(result.name).toBe("Custom")`.

(Note: the pre-existing test "should return correct initial values for a new question" also independently discriminates — it flips from `"Test Question"` to `"Table 1"` under the mutant — but the added test explicitly encodes the bug's user scenario.)

## 3. Bug summary

When saving a brand-new ad-hoc question, the user types a name (e.g. "Custom") and the save request fires. While the request is in flight, the question object propagated into the save form now carries that typed name as its display name. `getInitialValues` recomputes the form's `name` field. With the bug, the ad-hoc branch returns `question.generateQueryDescription()` (e.g. "Orders" / "Table 1") instead of the user's display name, so the input momentarily reverts to the default query-derived title — a visible "flash of default title" before the modal closes. The e2e catches it with a 10ms-timeout `findByDisplayValue("Orders").should("not.exist")`.

## 4. Outcome

**witness_authored** — the bug is unit-catchable. The defect lives in the pure function `getName`/`getInitialValues` (a value derivation), so a jsdom-free jest assertion on the returned `name` fully discriminates clean from mutant. The e2e's real value was only its tight timing window to observe a transient render; the underlying decision is a pure seam and is faithfully covered at the unit level.

## 5. Confidence

High. The mutation is the exact inverse of the fix commit's `util.ts` diff (dropping the `question.displayName() ||` precedence), reintroducing the precise value that produced the flash. The witness passes on clean HEAD and fails on the mutant with a clean value assertion (not a compile/throw error), and the sanity check inside the test confirms the query description genuinely differs from the typed name, so the assertion is meaningful. The `context.tsx` half of the original fix is timing/reference-identity plumbing that current code handles differently and is not needed to reproduce the observable behavior the e2e asserts.