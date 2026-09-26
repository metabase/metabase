Both the product mutation and the witness spec are in the worktree. Task complete.

## Report

### 1. git diff (product mutation)
Semantic revert of the request-gating predicate in `frontend/src/metabase/metadata/components/FieldSection/BehaviorSection/RemappingPicker/RemappingPicker.tsx` (code drifted from the fix commit's `pages/DataModel/...` path to `components/...`, but the logic is identical):

```diff
   } = useGetFieldValuesQuery(id, {
-    skip: value !== "custom" && !isChoosingDisplayValue,
-  });
+  } = useGetFieldValuesQuery(id);
```

This restores the pre-fix behavior exactly (`useGetFieldValuesQuery(id)` with no `skip`), so field values are fetched unconditionally on mount.

### 2. Witness
New added spec: `frontend/src/metabase/metadata/components/FieldSection/BehaviorSection/RemappingPicker/RemappingPicker.unit.spec.tsx`

It renders `RemappingPicker` with a plain field (empty `dimensions` → display value `"original"`, dropdown closed), mocks `GET /api/field/1/values`, and asserts `fetchMock.callHistory.calls("path:/api/field/1/values")` has length 0. A positive-control test (field with an `internal` dimension → value `"custom"`) asserts the request IS made.

Oracle command:
```
bun run test-unit-keep-cljs frontend/src/metabase/metadata/components/FieldSection/BehaviorSection/RemappingPicker/RemappingPicker.unit.spec.tsx
```
- PASS on clean HEAD: both tests pass (2 passed).
- FAIL on mutant: negative test fails — `expect(received).toHaveLength(expected) / Expected length: 0 / Received length: 1` (a `GET http://localhost/api/field/1/values` was recorded). Positive control still passes, confirming the discriminator is specific to the gating, not a broken mock.

### 3. Bug summary
The Data Model field editor's display-values picker always eagerly fetched a field's values (`GET /api/field/:id/values`) on mount, even when the field's display value is not "Custom mapping" and the user never opened the picker. This is the behavior the e2e repro (metabase#62626) guards: after discarding cached field values, the values must not be automatically re-fetched unless "Custom mapping" is in use (`cy.get("@fieldValues.all").should("have.length", 0)`).

### 4. Outcome
`witness_authored` — the bug is unit-catchable at the component level. The observable is purely "was the field-values HTTP request issued?", which fetch-mock records deterministically in jsdom; no real browser, routing, or layout geometry is involved. The e2e is replaceable by this jest component test.

### 5. Confidence
High. The mutation is a faithful, minimal reintroduction: it is byte-for-byte the pre-fix hook call, and the sole product change in the fix commit was adding this `skip` predicate. The witness discriminates cleanly (assertion failure, not a compile/mock error), passes on clean HEAD, fails on the mutant, and includes a positive control proving the field-values endpoint fires when it should — so the negative assertion is testing the gate, not a dead endpoint. The `findByPlaceholderText("Select display values")` await flushes React effects so RTK Query's mount-time subscription fires before the assertion, making the absence check non-racy (the mutant reliably records the call by that point).