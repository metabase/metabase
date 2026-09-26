# 63537: SQL field filter can't map to a Postgres enum column

Status: live. Base `8317274709c`. Oracle: the master spec named in the record's hint.

## Where the code moved
The fix (48376d3f63a, #64045 "Fix field filters for type/TextLike") added `|| field.isStringLike()` to the `isString` flag in `fieldFilterForParameter` in `frontend/src/metabase-lib/v1/parameters/utils/filters.ts`. The file didn't move. Later, cf3200aa96e (#80974, "Load the template tag's field from the API, not the metadata mirror") rewrote the function to take a plain field shape and call the isa helpers. The line now reads `isString: isString(field) || isStringLike(field)`, which is why July's reverse patch conflicts.

## Mutant
`isString: isString(field) || isStringLike(field)` becomes `isString: isString(field)`, with the now-unused `isStringLike` import removed. That is exactly the condition before the fix. A Postgres enum syncs as `type/TextLike`, which isn't `type/Text`, so no `string/*` option passes; `getParameterOptionsForField` returns nothing for the column and the field filter gets no widget type. `columnFilterForParameter` (the query-builder path) already used `Lib.isStringOrStringLike` and was left alone.

## Oracle
`template-tag-options.unit.spec.ts` › getParameterOptionsForField › "should return string options for a TextLike field", built on a real `Field` with `base_type: "type/TextLike"`.

Clean HEAD, both of the fix's specs: 17 passed. Mutant: `✕ should return string options for a TextLike field  Expected: true  Received: false` at line 97; 1 failed, 5 passed. The fix's other unit case also fails with an assertion (`filters.unit.spec.ts` line 78, expected true, received false).

## Adversarial check
A `toBe(true)` on a boolean, no render, crash or timeout. The other five tests in the file (date, id, address, option list) still pass, so only the TextLike branch changed.

## Variants, against the TextLike test
- variant-1: `isString(field) && isStringLike(field)`. **Kill**; also breaks the address test.
- variant-2: `isStringLike(field)` alone. **Survive**; plain `type/Text` fields lose their string widgets; only the address test in the same file catches it.
- variant-3: the same term dropped in `columnFilterForParameter` (`Lib.isString` for `Lib.isStringOrStringLike`). **Survive**; the oracle only exercises the field path.

## Gotchas
- `DimensionPickerSidebar.unit.spec.tsx`, July's second killer, no longer catches the mutant (47 of 47 pass).
- `metabase.driver.postgres-test/enum-field-filter-test` runs the query on the backend and can't see this frontend bug.
- No `.cljc` changed; no cljs rebuild.
