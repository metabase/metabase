# native-table-tags

Port of `e2e/test/scenarios/native/table-tags.cy.spec.ts` → `tests/native-table-tags.spec.ts`.

- **Size**: 1 test. **Result**: 1/1 green on the jar (slot 4, COMMIT-ID 751c2a98), stable under `--repeat-each=2` (2/2). tsc clean.
- **Fixes needed**: none. Clean mechanical port — every dependency already existed as a shared helper (`startNewNativeQuestion`, `typeInNativeEditor`, `runNativeQuery`, `assertQueryBuilderRowCount`, `popover`).
- **New helpers**: `support/native-table-tags.ts` — `variableTypeSelect` and `mapTableTag` (assign a `{{table}}` tag the "Table" variable type, then map it to a named table). findByText string args ported as exact matches (rule 1).
- **Feature under test**: table template tags (`{{table}}`), added upstream in #68922 — the tag is mapped to a concrete table (referenced as a CTE at run time) via the variable-type-select picker.
- No fixme / product-bug claims, so no Cypress cross-check was required.

## Consolidation note (not blocking)
`getVariableTypeSelect` / `variable-type-select` is now defined spec-locally in
`native-snippet-tags.spec.ts` and also in `support/native-table-tags.ts`
(`variableTypeSelect`). Minor dup — a future pass could point snippet-tags at
the shared `variableTypeSelect`.
