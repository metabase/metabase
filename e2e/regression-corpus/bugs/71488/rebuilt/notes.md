# 71488: funnel renders empty under content translation

Status: live. Base `8317274709c`. Oracle: the fix's own spec on master.

## Where the code is now
The code has not moved. `FunnelNormal.tsx` is still at `frontend/src/metabase/visualizations/components/FunnelNormal.tsx`, and `getSortedRows` is still exported with the body the fix (f01f753ff24, #71810) added. July's inverse patch conflicts only because the import block changed: `metabase/viz-core` now supplies `HoveredObject`, `calculateFunnelSteps` and `computeChange`, and `metabase/utils/formatting` replaces `metabase/lib`. The `funnel.rows` setting in `Funnel/definition.ts` still builds its keys from `getRowsForStableKeys(rawSeries[0].data)`, which returns `untranslatedRows ?? rows`.

## The mutant (one line)
In `getSortedRows`, `rowsForKeys.findIndex(...)` becomes `rows.findIndex(...)`. The funnel.rows keys are untranslated ("Awareness"), and the component passes the translated rows as `rows` ("Povědomí"). With this change every key misses, `sortedRows` is `[]`, and the funnel draws no steps. That matches the pre-fix inline code, `rows.find(row => formatNullable(row[dim]) === fr.key)` over translated rows. Without translation, `rows === rowsForKeys`, so ordinary funnels still work. July's inverse patch deleted the exported `getSortedRows`, so the spec died with "getSortedRows is not a function". This mutant keeps the export and the signature.

## Oracle
`frontend/src/metabase/visualizations/components/FunnelNormal.unit.spec.ts`::`FunnelNormal row matching (metabase#71488) returns translated rows for display while matching on untranslated keys`

Clean HEAD: 3 of 3 pass. Mutant: 2 fail, 1 passes. First failure: `expect(received).toHaveLength(expected) Expected length: 3 Received length: 0 Received array: []` at line 60. The test without translation still passes. `Funnel/Funnel.unit.spec.tsx` (4 render tests) passes on the mutant, so the component still renders.

## Adversarial check
Assertion failures on the returned array, not errors. The module loads and the export exists. The untranslated test still passes, so the failure depends on translated rows and isn't a general break. The received value, `[]`, is the user-visible symptom: an empty funnel.

## Variants
- variant-1 (wiring): the component sets `rowsForKeys = rows` instead of `getRowsForStableKeys(series.data)`. Same user bug at the call site. **Survives**: the spec calls `getSortedRows` directly and never renders `FunnelNormal` with `untranslatedRows`.
- variant-2: returns `rowsForKeys[idx]`, so labels are untranslated. **Killed**: expected "Povědomí", received "Awareness".
- variant-3: `idx > 0` instead of `idx !== -1`, drops the first step. **Killed** by all three tests.

## For the next person
- No cljs involved. Jest runs directly on the `.tsx`.
- The oracle guards the helper only. To catch variant-1 you'd need a render test that passes `data.untranslatedRows` to `FunnelNormal`.
- `Funnel.unit.spec.tsx` prints long React stack traces; console noise, the suite passes.
