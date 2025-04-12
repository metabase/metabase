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
- **Format:** `yarn prettier`
- **Type Check:** `yarn type-check`
- **Unit Test:** `yarn test-unit path/to/file.unit.spec.ts` or `yarn test-unit -t "pattern"`
- **Unit Test Watch:** `yarn test-unit-watch path/to/file.unit.spec.ts`
- **E2E Test:** `MB_EDITION=oss OPEN_UI=false yarn test-cypress --spec path/to/file.cy.spec.ts`

### Clojure
- **Lint:** `./bin/mage kondo [path]`
- **Format:** `./bin/mage cljfmt-files [path]`
- **Test file:** `clojure -X:dev:test :only namespace/test-name`

### ClojureScript
- **Test:** `yarn test-cljs`


## Frontend

### Unit Tests

When generating a unit test, follow these steps:
- Run `yarn type-check` and verify that the types are correct. If there are errors, fix them and try again.
- If there are multiple tests in the test file and other tests are not changed, change `it` to `it.only` to run only
these tests. Then run `yarn test-unit path/to/file.unit.spec.ts`, where `path/to/file.unit.spec.ts` is the path to your
test file. If the tests fail, fix issues and try again. If the tests pass, change `it.only` back to `it`.

### E2E Tests

When generating a cypress end-to-end test, follow these steps:
- Run `yarn type-check` and verify that the types are correct. If there are errors, fix them and try again.
- If there are multiple tests in the test file and other tests are not changed, change `it` to `it.only` to run only
these tests. Run `MB_EDITION=oss OPEN_UI=false yarn test-cypress --spec path/to/file.cy.spec.ts`,  where
`path/to/file.cy.spec.ts` is the path to your test file. If the tests fail, fix issues and try again. If the tests pass,
change `it.only` back to `it`.
