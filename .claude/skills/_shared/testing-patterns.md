# Testing Patterns

Guidance that recurs in Gadget FE reviews. Apply before writing a new helper or a new spec.

## Use the known helpers — don't roll your own

Before inventing a helper or mock factory, check if one exists:

- **Queries:** `H.createTestQuery` (announced team helper — prefer over ad-hoc MBQL construction).
- **Location / router:** `createMockLocation`.
- **Datasets and responses:** `createMockDataset` and siblings in `frontend/src/metabase-types/api/mocks/`.
- **E2E API helpers:** all API-level helpers must live in `e2e/support/helpers/api/`. Do not inline `cy.request` against raw endpoints inside a spec.
- **E2E scoped helpers:** access via `const { H } = cy;` — not direct imports.

If you need a new helper in any of these areas, add it to the shared location rather than writing a local one.

## Test real behavior, not shape

- A "unit test" that asserts the shape of a returned object without exercising the logic has little value. Test the behavior the code is responsible for.
- For a plugin or extension point, assert the user-visible outcome: is the plugin available in the sidebar? Do existing cards still render (with a fallback viz type) after removal? Those are the tests that catch real regressions.

## Cypress specifics

- **`Cypress.env` is deprecated.** Do not introduce new usages. Use the documented alternative (env config, helper arguments, or a dedicated helper).
- Use existing `cy.intercept` helpers from `e2e/support/helpers/api/` instead of hand-writing intercepts in the spec. If an intercept helper is missing, add one.
- Match the patterns of the closest existing spec in the same `e2e/test/scenarios/<area>/` folder.

## Before you submit a test

- [ ] No duplicated mock factory — reused the existing one.
- [ ] No inline API helper — lives in `e2e/support/helpers/api/` or `metabase-types/api/mocks/`.
- [ ] Asserts the behavior, not just the shape.
- [ ] No `Cypress.env`.
