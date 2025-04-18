# Metabase Development Guide

## Autonomous Development Workflow

- Do not attempt to read or edit files outside the project folder
- Add failing tests first, then fix them
- Work autonomously in small, testable increments
- Run targeted tests, and lint continuously during development
- Prioritize understanding existing patterns before implementing
- Don't commit changes, leave it for the user to review and make commits

## Quick Commands

### JavaScript/TypeScript

- **Lint:** `yarn lint-eslint`
- **Test:** `yarn test-unit path/to/file.unit.spec.js` or `yarn test-unit -t "pattern"`
- **Watch:** `yarn test-unit-watch path/to/file.unit.spec.js`
- **Format:** `yarn prettier`
- **Type Check:** `yarn type-check`

### Clojure

- **Lint:** `./bin/mage kondo [path]`
- **Format:** `./bin/mage cljfmt-files [path]`
- **Test file:** `clojure -X:dev:test :only namespace/test-name`

### ClojureScript

- **Test:** `yarn test-cljs`

## Codebase rules

### General

- Every change MUST include automated tests
- Use isolated unit tests when the change is reasonable to test without complex dependencies
- For more complex cases, write e2e Cypress tests in `e2e/test/scenarios/*`
- Avoid unnecessary comments; write self-documenting code. Use comments when you need to explain why things are certain way.

### Frontend

- Using TypeScript for new code is preferred. Type casting is prohibited.
- Components should be in their own directories with related files
- Customized Mantine UI is used as a main UI component library. Components are exported from `metabase/ui`
- For styling prefer using Mantine UI style props. If necessary, use CSS modules
- If a javascript/typescript file imports `cljs` file e.g. "cljs/metabase.pivot.js" then you MUST NOT READ IT as it contains transpiled Clojure to JS code. Instead, find the original \*.cljs code.

#### Unit tests

- New unit test must be consistent in their approach and style with the existing E2E tests
- Use `mockScrollIntoView` and similar DOM mocks for browser APIs not available in jsdom
- API requests mocks are available in `frontend/test/__support__/server-mocks/`
- Use mock factories from `metabase-types/api/mocks` instead of creating custom test objects. Common examples include `createMockCard`, `createMockUser`, `createMockCollection`, etc.
- Unit tests must not mock internal details of components/functions being tested
- Use the `renderWithProviders` helper from `frontend/test/__support__/ui.tsx` for component rendering
- For simple components, use `renderWithTheme` if you only need theme support
- Avoid using component internals or snapshot testing

#### E2E tests

- New E2E test must be consistent in their approach and style with the existing E2E tests
- Prefer using helpers from `e2e/support/helpers/*` such as H.startNewQuestion() when available
- Use H.restore() in beforeEach() to reset the state of the Metabase application database

```
beforeEach(() => {
  H.restore();
});
```

- Custom commands such as cy.signInAsAdmin() or cy.signInAsNormalUser() can be used to authenticate a user
