The reconstruction is complete and the diff is left in the worktree. Here is my report.

## 1. git diff — semantic revert

`frontend/src/metabase/querying/parameters/utils/parsing.ts`, in `deserializeNumberParameterValue`:

```diff
     if (typeof item === "string") {
-      return parseNumber(item);
+      return item;
     }
```

This reintroduces bug 31662: string-typed elements of a number parameter's value array are no longer coerced to numbers (the between filter's URL values `?between=10&between=20` arrive as `["10","20"]`).

## 2. Oracle

- Spec: `frontend/src/metabase/querying/parameters/utils/parsing.unit.spec.ts`
- Command (from worktree root): `bun run test-unit-keep-cljs frontend/src/metabase/querying/parameters/utils/parsing.unit.spec.ts`
- Baseline (clean HEAD): **167 passed, 0 failed**
- Reconstructed (mutation applied): **34 failed, 133 passed**

## 3. failure_shape

Test: `number parameters › number/between › should deserialize ["9007199254740993", "9007199254740995"]`

```
expect(received).toEqual(expected)
Array [
-   9007199254740993n,      // expected: parsed to bigint
-   9007199254740995n,
+   "9007199254740993",     // received: left as raw string
+   "9007199254740995",
]
```

A clean value mismatch (bigint/number vs raw string), not a compile/import error.

## 4. Confidence + adversarial

High confidence, well isolated. All 34 failures fall inside the `number parameters` describe block (`number/=`, `number/!=`, `number/>=`, `number/<=`, `number/between`) and every one is a case that feeds a **string** into a numeric parameter. Sibling blocks stay fully green: all `string parameters`, `boolean parameters`, `date parameters`, and `temporal unit parameters` tests pass, as do the pure-numeric number cases (e.g. `[10, 20]`, `{value: 1}`). The failure therefore isolates exactly the reverted behavior — string→number coercion in number params — which is the surviving equivalent of the fix's original `parseParameterValueForNumber` array handling. This matches issue 31662's blast radius (the original `if (Array.isArray(value)) return value.map(parseFloat)` applied to all number params, not just between).

## 5. Outcome

**kill** — with a notable oracle relocation. The fix's shipped jest spec (`FieldValuesWidget.unit.spec.js`, and its `getNonVirtualFields` product path in `fetchFieldValues`) is a **dead target**: both were deleted as dead code in #56739 after a chain of relocations (`.js`→`.tsx` in #32202, dir move to `parameters/components/widgets/ParameterFieldWidget/FieldValuesWidget/` in #56461, deletion in #56739). However, the fix's **second** product change — the number-array parsing in `parameter-values.js`'s `parseParameterValueForNumber` — survived, relocating first to `frontend/src/metabase/parameters/utils/parameter-parsing.ts` and its core array-coercion into `deserializeNumberParameterValue` in `frontend/src/metabase/querying/parameters/utils/parsing.ts`. That surviving logic is exercised by a dedicated `number/between` jest block in `parsing.unit.spec.ts`, which is the discriminating oracle used here. Issue 31662 is closed by an existing unit test; no new test needed.