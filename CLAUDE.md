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

### Frontend

- Using TypeScript for new code is preferred
- Components should be in their own directories with related files
- Redux Toolkit should be used for the global state management in the frontend
- Customized Mantine UI is used as a main UI component library. Components are exported from `metabase/ui`
- For styling prefer using Mantine UI style props. If necessary, use CSS modules
- Tests should be comprehensive and match the existing patterns
- When writing unit tests use factories such as `createMockCard` for creating test objects
- Tests must not mock internal details of components/functions being tested
- If a javascript/typescript file imports `cljs` file e.g. "cljs/metabase.pivot.js" then you MUST NOT NOT READ IT as it contains transpiled Clojure to JS code. Instead, find the original \*.cljs code
