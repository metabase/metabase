---
title: End-to-end tests with Cypress
---

# End-to-end tests with Cypress

Metabase uses Cypress for “end-to-end testing”, that is, tests that are executed against the application as a whole, including the frontend, backend, and application database. These tests are essentially scripts written in JavaScript that run in the web browser: visit different URLs, click various UI elements, type text, and assert that things happen as expected (for example, an element appearing on screen, or a network request occuring).

## Getting started

Metabase’s Cypress tests are located in the `frontend/test/metabase/scenarios` source tree, in a structure that roughly mirrors Metabase’s URL structure. For example, tests for the admin “datamodel” pages are located in `frontend/test/metabase/scenarios/admin/datamodel`.

During development you will want to run `yarn build-hot` to continuously build the frontend, and `yarn test-cypress-open` to open the Cypress application where you can execute the tests you are working on.

To run all Cypress tests programmatically in the terminal:
```
yarn run test-cypress-run
```

You can run a specific set of scenarios by using the `--folder` flag, which will pick up the chosen scenarios under `frontend/test/metabase/scenarios/`.

```
yarn run test-cypress-run --folder sharing
```

You can quickly test a single file only by using the `--spec` flag.

```
yarn test-cypress-run --spec frontend/test/metabase/scenarios/question/new.cy.spec.js
```

Cypress test files are structured like Mocha tests, where `describe` blocks are used to group related tests, and `it` blocks are the tests themselves.

```js
describe("homepage",() => {
  it('should load the homepage and...', () => {
    cy.visit("/metabase/url");
    // ...
  })
})
```

We strongly prefer using selectors like `cy.findByText()` and `cy.findByLabelText()` from [`@testing-library/cypress`](https://github.com/testing-library/cypress-testing-library) since they encourage writing tests that don't depend on implementation details like CSS class names.

Try to avoid repeatedly testing pieces of the application incidentally. For example, if you want to test something about the query builder, jump straight there using a helper like `openOrdersTable()` rather than starting from the home page, clicking "New", then "Question", etc.

## Cypress Documentation

* Introduction: https://docs.cypress.io/guides/core-concepts/introduction-to-cypress.html#Querying-by-Text-Content
* Commands: https://docs.cypress.io/api/api/table-of-contents.html
* Assertions: https://docs.cypress.io/guides/references/assertions.html

## Tips/Gotchas

### `contains` vs `find` vs `get`

Cypress has a set of similar commands for selecting elements. Here are some tips for using them:
* `contains` is case-sensitive to the text *in the DOM*. If it’s not matching text you’d expect, check that CSS hasn’t updated the case.
* `contains` matches substrings, so if you see “filter by” and “Add a filter”, `contains(“filter”)` will match both. To avoid these issues, you can either pass a regexp that pins the start/end of the string or pass a selector in addition to the string: `.contains(selector, content)`.
* `find` will let you search within your previous selection. `get` will search the entire page even if chained.

### Increase viewport size to avoid scrolling
Sometimes Metabase views are a bit large for Cypress’s default 1000x660 viewport. This can require you to scroll for tests to work. To avoid that, you can increase the viewport size for a specific test by calling `cy.viewport(width, height)`.

### Code reloading vs test reloading
When you edit a Cypress test file, the tests will refresh and run again. However, when you edit a code file, Cypress won’t detect that change. If you’re running `yarn build-hot`, the code will rebuild and update within Cypress. You’ll have to manually click rerun after the new code has loaded.

### Inspecting while the “contains helper” is open
One great feature of Cypress is that you can use the Chrome inspector after each step of a test. They also helpfully provide a helper that can test out `contains` and `get` calls. This helper creates new UI that prevents inspecting from targeting the correct elements. If you want to inspect the DOM in Chrome, you should close this helper.

### Putting the wrong HTML template in the Uberjar
`yarn build` and `yarn build-hot` each overwrite an HTML template to reference the correct Javascript files. If you run `yarn build` before building an Uberjar for Cypress tests, you won’t see changes to your Javascript reflected even if you then start `yarn build-hot`.


## DB Snapshots

At the beginning of each test suite we wipe the backend's db and settings cache. This ensures that the test suite starts in a predictable state.

Typically, we use the default snapshot by adding `before(restore)` inside the first `describe` block to restore before running the whole test suite. If you want to use a snapshot besides the default one, specify the name as an argument to `restore` like this: `before(() => restore("blank"))`. You can also call `restore()` inside `beforeEach()` to reset before every test, or inside specific tests.

Snapshots are created with a separate set of Cypress tests. These tests start with a blank database and execute specific actions to put the database in predictable state. For example: signup as bob@metabase.com, add a question, turn on setting ABC.

These snapshot-generating tests have the extension `.cy.snap.js`. When these tests run they create db dumps in `frontend/tests/snapshots/*.sql`. They are run before the tests begin and don't get committed to git.

## Running in CI
Cypress records videos of each test run, which can be helpful in debugging. Additionally, failed tests have higher quality images saved.


These files can be found under the “Artifacts” tab in Circle:
![Circle CI Artifacts tab](https://user-images.githubusercontent.com/691495/72190614-f5995380-33cd-11ea-875e-4203d6dcf1c1.png)
